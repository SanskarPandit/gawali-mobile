from decimal import Decimal

from django.db import transaction
from django.db.models import DecimalField, OuterRef, Prefetch, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.services import generate_temporary_password
from apps.core.permissions import IsCustomerUser, IsDairyUser
from apps.core.scheduling import earliest_changeable_date
from apps.dairies.models import Dairy, DeliveryRoute
from apps.subscriptions.models import Subscription
from apps.subscriptions.services import PlanError, current_plan, set_plan, subscribable_product
from .models import CustomerProfile
from .serializers import (
    CustomerProfileSerializer,
    CustomerSelfUpdateSerializer,
    CustomerSetupSerializer,
    DairyCustomerCreateSerializer,
    DairyCustomerListSerializer,
    DairyCustomerUpdateSerializer,
    RouteReorderSerializer,
    find_existing_customer_user,
)


def get_customer_profile(user) -> CustomerProfile:
    profile, _ = CustomerProfile.objects.get_or_create(user=user)
    return profile


class CustomerProfileView(APIView):
    """Customer reads or edits their own delivery details."""
    permission_classes = [IsCustomerUser]

    @extend_schema(responses={200: CustomerProfileSerializer})
    def get(self, request):
        return Response(CustomerProfileSerializer(get_customer_profile(request.user)).data)

    @extend_schema(request=CustomerSelfUpdateSerializer, responses={200: CustomerProfileSerializer})
    def patch(self, request):
        profile = get_customer_profile(request.user)
        serializer = CustomerSelfUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(CustomerProfileSerializer(profile).data)


class CustomerSetupView(APIView):
    """Customer onboarding: choose a dairy and daily plan, and set the delivery address."""
    permission_classes = [IsCustomerUser]

    @extend_schema(request=CustomerSetupSerializer, responses={200: CustomerProfileSerializer})
    def post(self, request):
        serializer = CustomerSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        dairy = Dairy.objects.filter(id=data['dairy_id'], is_active=True, is_verified=True).first()
        if dairy is None:
            return Response({'dairy_id': ['This dairy is not accepting customers.']}, status=status.HTTP_400_BAD_REQUEST)

        profile = get_customer_profile(request.user)
        if profile.dairy_id and profile.dairy_id != dairy.id and current_plan(profile):
            return Response(
                {'detail': 'You already have an active plan with another dairy. Cancel it before switching.'},
                status=status.HTTP_409_CONFLICT,
            )

        try:
            product = subscribable_product(dairy, data['product_id'])
            with transaction.atomic():
                if profile.dairy_id != dairy.id:
                    profile.delivery_route = None
                    profile.route_stop_order = 0
                profile.dairy = dairy
                profile.address = data['address'].strip()
                profile.flat_or_house_number = data.get('flat_or_house_number', '')
                profile.landmark = data.get('landmark', '')
                profile.delivery_instructions = data.get('delivery_instructions', '')
                profile.latitude = data.get('latitude')
                profile.longitude = data.get('longitude')
                profile.is_active = True
                profile.save()
                plan = set_plan(
                    profile,
                    product=product,
                    quantity=data['default_quantity'],
                    time_slot=data['delivery_time_slot'],
                    status=Subscription.Status.ACTIVE,
                )
        except PlanError as exc:
            return Response(exc.as_response_data(), status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'message': f"Your deliveries start on {plan.start_date.strftime('%d %b %Y')}.",
            'profile': CustomerProfileSerializer(profile).data,
        })


class CustomerDashboardView(APIView):
    """Customer home: today's delivery, plan, month-to-date spend and unpaid bill."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        from apps.billing.models import Bill
        from apps.deliveries.models import DailyDelivery
        from apps.subscriptions.models import Order

        profile = get_customer_profile(request.user)
        today = timezone.localdate()
        plan = current_plan(profile)

        today_delivery = DailyDelivery.objects.filter(subscription__customer=profile, delivery_date=today).first()
        start_of_month = today.replace(day=1)
        delivered = DailyDelivery.objects.filter(
            subscription__customer=profile,
            delivery_date__range=(start_of_month, today),
            status=DailyDelivery.Status.DELIVERED,
        ).select_related('subscription__product')
        delivered_qty = sum((d.delivered_quantity for d in delivered), Decimal('0'))
        milk_amount = sum((d.delivered_quantity * d.subscription.product.price_per_unit for d in delivered), Decimal('0'))
        extras_amount = Order.objects.filter(
            customer=profile, delivery_date__range=(start_of_month, today), status=Order.Status.DELIVERED
        ).aggregate(total=Coalesce(Sum('total_price'), Value(Decimal('0')), output_field=DecimalField()))['total']
        unpaid = Bill.objects.filter(customer=profile, due_amount__gt=0).order_by('-billing_month').first()
        upcoming_orders = Order.objects.filter(
            customer=profile, delivery_date__gte=today, status=Order.Status.PENDING
        ).count()

        dairy = profile.dairy
        return Response({
            'customer_name': request.user.full_name,
            'today': today.isoformat(),
            'needs_onboarding': profile.dairy_id is None or not profile.address,
            'dairy': {
                'id': str(dairy.id),
                'name': dairy.business_name,
                'phone': dairy.phone,
                'cutoff_time': dairy.cutoff_time.strftime('%H:%M:%S'),
                'upi_id': dairy.bank_upi_id,
            } if dairy else None,
            'earliest_changeable_date': earliest_changeable_date(dairy).isoformat(),
            'subscription': {
                'id': str(plan.id),
                'product_id': str(plan.product_id),
                'product_name': plan.product.name,
                'default_quantity': plan.default_quantity,
                'unit': plan.product.unit,
                'price_per_unit': plan.product.price_per_unit,
                'status': plan.status,
                'delivery_time_slot': plan.delivery_time_slot,
                'start_date': plan.start_date.isoformat(),
            } if plan else None,
            'today_delivery': {
                'id': str(today_delivery.id),
                'status': today_delivery.status,
                'scheduled_quantity': today_delivery.scheduled_quantity,
                'delivered_quantity': today_delivery.delivered_quantity,
                'delivered_at': today_delivery.delivered_at.isoformat() if today_delivery.delivered_at else None,
            } if today_delivery else None,
            'this_month_so_far': {
                'delivered_quantity': delivered_qty,
                'delivered_days': delivered.count(),
                'estimated_amount': (milk_amount + extras_amount).quantize(Decimal('0.01')),
            },
            'upcoming_orders': upcoming_orders,
            'unpaid_bill': {
                'bill_id': str(unpaid.id),
                'month': unpaid.billing_month.strftime('%B %Y'),
                'due_amount': unpaid.due_amount,
                'due_date': unpaid.due_date.isoformat() if unpaid.due_date else None,
            } if unpaid else None,
        })


def _dairy_customers(dairy):
    from apps.billing.models import Bill

    outstanding = (
        Bill.objects.filter(customer=OuterRef('pk'))
        .values('customer')
        .annotate(total=Sum('due_amount'))
        .values('total')
    )
    return (
        CustomerProfile.objects.filter(dairy=dairy, user__is_deleted=False)
        .select_related('user', 'delivery_route', 'dairy')
        .prefetch_related(Prefetch('subscriptions', queryset=Subscription.objects.select_related('product')))
        .annotate(outstanding=Coalesce(Subquery(outstanding, output_field=DecimalField()), Value(Decimal('0')), output_field=DecimalField()))
    )


class DairyCustomerListView(generics.ListCreateAPIView):
    """Dairy's households: list with plan and dues, or add a household with its plan."""
    permission_classes = [IsDairyUser]
    serializer_class = DairyCustomerListSerializer

    def get_queryset(self):
        qs = _dairy_customers(self.request.user.dairy)
        params = self.request.query_params
        search = params.get('search')
        if search:
            qs = qs.filter(
                Q(user__full_name__icontains=search)
                | Q(user__phone__icontains=search)
                | Q(address__icontains=search)
                | Q(flat_or_house_number__icontains=search)
            )
        route_id = params.get('route_id')
        if route_id == 'none':
            qs = qs.filter(delivery_route__isnull=True)
        elif route_id:
            qs = qs.filter(delivery_route_id=route_id)
        if params.get('has_dues') == 'true':
            qs = qs.filter(outstanding__gt=0)
        if params.get('active', 'true') == 'true':
            qs = qs.filter(is_active=True)
        return qs.order_by('route_stop_order', 'user__full_name')

    @extend_schema(request=DairyCustomerCreateSerializer, responses={201: DairyCustomerListSerializer})
    def create(self, request, *args, **kwargs):
        dairy = request.user.dairy
        serializer = DairyCustomerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        user, conflict = find_existing_customer_user(data['email'], data['phone'])
        if conflict:
            return Response({'detail': conflict}, status=status.HTTP_409_CONFLICT)
        if user is not None:
            existing = getattr(user, 'customer_profile', None)
            if existing and existing.dairy_id and existing.dairy_id != dairy.id and current_plan(existing):
                return Response(
                    {'detail': 'This customer already has an active plan with another dairy.'},
                    status=status.HTTP_409_CONFLICT,
                )
            if existing and existing.dairy_id == dairy.id and current_plan(existing):
                return Response({'detail': 'This customer is already on your list.'}, status=status.HTTP_409_CONFLICT)

        route = None
        if data.get('delivery_route'):
            route = DeliveryRoute.objects.filter(id=data['delivery_route'], dairy=dairy).first()
            if route is None:
                return Response({'delivery_route': ['Route not found.']}, status=status.HTTP_400_BAD_REQUEST)

        temporary_password = None
        try:
            product = subscribable_product(dairy, data['product_id'])
            with transaction.atomic():
                if user is None:
                    temporary_password = generate_temporary_password()
                    user = User.objects.create_user(
                        email=data['email'],
                        password=temporary_password,
                        full_name=data['full_name'].strip(),
                        phone=data['phone'],
                        role=User.Role.CUSTOMER,
                    )
                profile = get_customer_profile(user)
                last_stop = CustomerProfile.objects.filter(dairy=dairy, delivery_route=route).order_by('-route_stop_order').first()
                profile.dairy = dairy
                profile.delivery_route = route
                profile.route_stop_order = (last_stop.route_stop_order + 1) if last_stop else 1
                profile.address = data['address'].strip()
                profile.flat_or_house_number = data.get('flat_or_house_number', '')
                profile.landmark = data.get('landmark', '')
                profile.delivery_instructions = data.get('delivery_instructions', '')
                profile.is_active = True
                profile.save()
                set_plan(
                    profile,
                    product=product,
                    quantity=data['default_quantity'],
                    time_slot=data['delivery_time_slot'],
                    status=Subscription.Status.ACTIVE,
                    start_date=data.get('start_date'),
                )
        except PlanError as exc:
            return Response(exc.as_response_data(), status=status.HTTP_400_BAD_REQUEST)

        body = DairyCustomerListSerializer(_dairy_customers(dairy).get(pk=profile.pk)).data
        body['temporary_password'] = temporary_password  # only for newly created accounts, shown once
        body['linked_existing_account'] = temporary_password is None
        return Response(body, status=status.HTTP_201_CREATED)


class DairyCustomerDetailView(APIView):
    """Dairy's ledger for one household, and editing of its delivery details."""
    permission_classes = [IsDairyUser]

    def _get(self, request, pk):
        return _dairy_customers(request.user.dairy).filter(id=pk).first()

    def get(self, request, pk):
        from apps.billing.models import Bill
        from apps.deliveries.models import DailyDelivery

        profile = self._get(request, pk)
        if not profile:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        plan = current_plan(profile)
        delivered = DailyDelivery.objects.filter(subscription__customer=profile, status=DailyDelivery.Status.DELIVERED)
        start_of_month = timezone.localdate().replace(day=1)
        month = delivered.filter(delivery_date__gte=start_of_month).select_related('subscription__product')
        month_qty = sum((d.delivered_quantity for d in month), Decimal('0'))
        month_amount = sum((d.delivered_quantity * d.subscription.product.price_per_unit for d in month), Decimal('0'))
        bills = Bill.objects.filter(customer=profile)
        totals = bills.aggregate(
            paid=Coalesce(Sum('paid_amount'), Value(Decimal('0')), output_field=DecimalField()),
            due=Coalesce(Sum('due_amount'), Value(Decimal('0')), output_field=DecimalField()),
        )
        recent = DailyDelivery.objects.filter(subscription__customer=profile).order_by('-delivery_date')[:14]

        return Response({
            'customer': DairyCustomerListSerializer(profile).data,
            'metrics': {
                'outstanding': totals['due'],
                'this_month_delivered': month_qty,
                'this_month_amount': month_amount.quantize(Decimal('0.01')),
                'lifetime_delivered': delivered.aggregate(
                    t=Coalesce(Sum('delivered_quantity'), Value(Decimal('0')), output_field=DecimalField())
                )['t'],
                'lifetime_paid': totals['paid'],
            },
            'subscription': {
                'id': str(plan.id),
                'product_id': str(plan.product_id),
                'product_name': plan.product.name,
                'default_quantity': plan.default_quantity,
                'price_per_unit': plan.product.price_per_unit,
                'unit': plan.product.unit,
                'status': plan.status,
                'delivery_time_slot': plan.delivery_time_slot,
                'start_date': plan.start_date.isoformat(),
            } if plan else None,
            'recent_deliveries': [{
                'id': str(d.id),
                'date': d.delivery_date.isoformat(),
                'scheduled_quantity': d.scheduled_quantity,
                'delivered_quantity': d.delivered_quantity,
                'status': d.status,
            } for d in recent],
            'bills': [{
                'id': str(b.id),
                'month': b.billing_month.strftime('%B %Y'),
                'billing_month': b.billing_month.isoformat(),
                'total_amount': b.total_amount,
                'paid_amount': b.paid_amount,
                'due_amount': b.due_amount,
                'status': b.status,
                'is_paid': b.due_amount <= 0,
            } for b in bills.order_by('-billing_month')[:12]],
        })

    @extend_schema(request=DairyCustomerUpdateSerializer, responses={200: DairyCustomerListSerializer})
    def patch(self, request, pk):
        profile = self._get(request, pk)
        if not profile:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = DairyCustomerUpdateSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(DairyCustomerListSerializer(self._get(request, pk)).data)


class DairyRouteReorderView(APIView):
    """Dairy sets the stop order of a route (the gawali's walking order)."""
    permission_classes = [IsDairyUser]

    @extend_schema(request=RouteReorderSerializer)
    def post(self, request):
        dairy = request.user.dairy
        serializer = RouteReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        route_id = serializer.validated_data['route_id']
        ids = serializer.validated_data['customer_ids']

        if route_id and not DeliveryRoute.objects.filter(id=route_id, dairy=dairy).exists():
            return Response({'route_id': ['Route not found.']}, status=status.HTTP_400_BAD_REQUEST)
        if len(set(ids)) != len(ids):
            return Response({'customer_ids': ['Each customer may appear only once.']}, status=status.HTTP_400_BAD_REQUEST)

        customers = {c.id: c for c in CustomerProfile.objects.filter(dairy=dairy, delivery_route_id=route_id, id__in=ids)}
        if len(customers) != len(ids):
            return Response({'customer_ids': ['Every customer must belong to this route.']}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            for position, cid in enumerate(ids, start=1):
                c = customers[cid]
                if c.route_stop_order != position:
                    c.route_stop_order = position
                    c.save(update_fields=['route_stop_order', 'updated_at'])
        return Response({'success': True})
