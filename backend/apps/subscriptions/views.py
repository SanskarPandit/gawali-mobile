import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsCustomerUser, IsDairyUser
from apps.core.scheduling import cutoff_message, date_range, earliest_changeable_date, refresh_manifests
from apps.customers.models import CustomerProfile
from apps.deliveries.models import DailyDelivery
from .models import DeliveryOverride, Order, Subscription, VacationPeriod
from .serializers import (
    DeliveryOverrideSerializer,
    OrderCreateSerializer,
    OrderSerializer,
    OrderStatusSerializer,
    PlanCreateSerializer,
    PlanUpdateSerializer,
    SetOverrideSerializer,
    SubscriptionSerializer,
    VacationPeriodSerializer,
)
from .services import PlanError, current_plan, set_plan, subscribable_product


def _customer(request) -> CustomerProfile:
    profile, _ = CustomerProfile.objects.get_or_create(user=request.user)
    return profile


def _apply_plan_update(customer, data):
    product = subscribable_product(customer.dairy, data['product_id']) if 'product_id' in data else None
    return set_plan(
        customer,
        product=product,
        quantity=data.get('default_quantity'),
        time_slot=data.get('delivery_time_slot'),
        status=data.get('status'),
    )


class SubscriptionDetailView(APIView):
    """Customer reads or changes their daily plan (quantity, product, slot, pause/resume)."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        plan = current_plan(_customer(request))
        return Response({'subscription': SubscriptionSerializer(plan).data if plan else None})

    @extend_schema(request=PlanUpdateSerializer)
    def patch(self, request):
        customer = _customer(request)
        if current_plan(customer) is None:
            return Response({'detail': 'You do not have a plan yet.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PlanUpdateSerializer(data=request.data, context={'can_cancel': False})
        serializer.is_valid(raise_exception=True)
        try:
            plan = _apply_plan_update(customer, serializer.validated_data)
        except PlanError as exc:
            return Response(exc.as_response_data(), status=status.HTTP_400_BAD_REQUEST)
        return Response({
            'success': True,
            'message': f"Your plan changes apply from {earliest_changeable_date(customer.dairy).strftime('%d %b')}.",
            'subscription': SubscriptionSerializer(plan).data,
        })


class DairyCustomerPlanView(APIView):
    """Dairy starts or changes a household's daily plan."""
    permission_classes = [IsDairyUser]

    def _customer(self, request, customer_id):
        return CustomerProfile.objects.filter(id=customer_id, dairy=request.user.dairy).first()

    @extend_schema(request=PlanCreateSerializer, responses={201: SubscriptionSerializer})
    def post(self, request, customer_id):
        customer = self._customer(request, customer_id)
        if customer is None:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if current_plan(customer):
            return Response({'detail': 'This customer already has a plan. Change it instead.'}, status=status.HTTP_409_CONFLICT)
        serializer = PlanCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            plan = set_plan(
                customer,
                product=subscribable_product(customer.dairy, data['product_id']),
                quantity=data['default_quantity'],
                time_slot=data['delivery_time_slot'],
                status=Subscription.Status.ACTIVE,
                start_date=data.get('start_date'),
            )
        except PlanError as exc:
            return Response(exc.as_response_data(), status=status.HTTP_400_BAD_REQUEST)
        return Response(SubscriptionSerializer(plan).data, status=status.HTTP_201_CREATED)

    @extend_schema(request=PlanUpdateSerializer, responses={200: SubscriptionSerializer})
    def patch(self, request, customer_id):
        customer = self._customer(request, customer_id)
        if customer is None:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)
        if current_plan(customer) is None:
            return Response({'detail': 'This customer has no plan yet.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = PlanUpdateSerializer(data=request.data, context={'can_cancel': True})
        serializer.is_valid(raise_exception=True)
        try:
            plan = _apply_plan_update(customer, serializer.validated_data)
        except PlanError as exc:
            return Response(exc.as_response_data(), status=status.HTTP_400_BAD_REQUEST)
        return Response(SubscriptionSerializer(plan).data)


class CalendarMonthView(APIView):
    """A month of deliveries for the customer: scheduled, delivered, skipped, vacations and extras."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        customer = _customer(request)
        today = timezone.localdate()
        try:
            year = int(request.query_params.get('year', today.year))
            month = int(request.query_params.get('month', today.month))
            first = date(year, month, 1)
        except ValueError:
            return Response({'detail': 'Invalid year or month.'}, status=status.HTTP_400_BAD_REQUEST)
        last = date(year, month, calendar.monthrange(year, month)[1])

        plan = current_plan(customer)
        earliest = earliest_changeable_date(customer.dairy)
        orders_by_day: dict = {}
        for o in Order.objects.filter(customer=customer, delivery_date__range=(first, last)).exclude(
            status=Order.Status.CANCELLED
        ).select_related('product'):
            orders_by_day.setdefault(o.delivery_date, []).append({
                'id': str(o.id), 'product_name': o.product.name, 'quantity': o.quantity, 'status': o.status,
            })

        vacations = list(VacationPeriod.objects.filter(
            customer=customer, is_active=True, start_date__lte=last, end_date__gte=first
        ))
        overrides = {}
        deliveries = {}
        if plan:
            overrides = {o.date: o for o in DeliveryOverride.objects.filter(subscription=plan, date__range=(first, last))}
            deliveries = {
                d.delivery_date: d for d in DailyDelivery.objects.filter(
                    subscription__customer=customer, delivery_date__range=(first, last)
                )
            }

        days = []
        for cur in date_range(first, last):
            in_vacation = any(v.start_date <= cur <= v.end_date for v in vacations)
            override = overrides.get(cur)
            delivery = deliveries.get(cur)
            plan_running = bool(plan) and plan.status == Subscription.Status.ACTIVE and plan.start_date <= cur and (
                plan.end_date is None or cur <= plan.end_date
            )

            if override:
                scheduled = override.quantity
            elif in_vacation or not plan_running:
                scheduled = 0
            else:
                scheduled = plan.default_quantity

            if delivery:
                day_status = delivery.status
                actual = delivery.delivered_quantity
            elif cur < today:
                day_status = 'no_record'
                actual = 0
            elif in_vacation:
                day_status, actual = 'vacation', 0
            elif scheduled == 0:
                day_status, actual = ('skipped' if override else 'none'), 0
            else:
                day_status, actual = 'scheduled', scheduled

            days.append({
                'date': cur.isoformat(),
                'day': cur.day,
                'weekday': cur.strftime('%a'),
                'scheduled_quantity': scheduled,
                'actual_quantity': actual,
                'status': day_status,
                'override_id': str(override.id) if override else None,
                'override_type': override.override_type if override else None,
                'is_vacation': in_vacation,
                'can_modify': bool(plan) and cur >= earliest and not in_vacation,
                'is_today': cur == today,
                'is_past': cur < today,
                'extras': orders_by_day.get(cur, []),
            })

        return Response({
            'year': year,
            'month': month,
            'has_subscription': plan is not None,
            'default_quantity': plan.default_quantity if plan else 0,
            'unit': plan.product.unit if plan else 'L',
            'cutoff_time': customer.dairy.cutoff_time.strftime('%H:%M:%S') if customer.dairy else None,
            'earliest_changeable_date': earliest.isoformat(),
            'days': days,
            'vacations': VacationPeriodSerializer(vacations, many=True).data,
        })


class SetDeliveryOverrideView(APIView):
    """Skip, double or change the quantity for one future day."""
    permission_classes = [IsCustomerUser]

    @extend_schema(request=SetOverrideSerializer)
    def post(self, request):
        customer = _customer(request)
        plan = current_plan(customer)
        if plan is None or plan.status != Subscription.Status.ACTIVE:
            return Response({'detail': 'You need an active plan to change a day.'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = SetOverrideSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target = serializer.validated_data['date']
        qty = serializer.validated_data['quantity']

        if target < earliest_changeable_date(customer.dairy):
            return Response({'detail': cutoff_message(customer.dairy)}, status=status.HTTP_400_BAD_REQUEST)
        if target > timezone.localdate() + timedelta(days=90):
            return Response({'detail': 'You can plan up to 90 days ahead.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            if qty == plan.default_quantity:
                # Same as the plan: no override needed.
                DeliveryOverride.all_objects.filter(subscription=plan, date=target).delete()
                override = None
            else:
                kind = (
                    DeliveryOverride.OverrideType.SKIP if qty == 0
                    else DeliveryOverride.OverrideType.DOUBLE if qty == plan.default_quantity * 2
                    else DeliveryOverride.OverrideType.CUSTOM
                )
                override, _ = DeliveryOverride.all_objects.update_or_create(
                    subscription=plan,
                    date=target,
                    defaults={
                        'quantity': qty,
                        'override_type': kind,
                        'reason': serializer.validated_data.get('reason', ''),
                        'is_deleted': False,
                        'deleted_at': None,
                    },
                )
            refresh_manifests(customer.dairy, [target])

        label = 'skipped' if qty == 0 else f'{qty} {plan.product.unit}'
        return Response({
            'success': True,
            'message': f"{target.strftime('%d %b')}: {label}",
            'override': DeliveryOverrideSerializer(override).data if override else None,
        })


class RemoveDeliveryOverrideView(APIView):
    """Undo a day's change and go back to the normal plan quantity."""
    permission_classes = [IsCustomerUser]

    def delete(self, request, pk):
        customer = _customer(request)
        override = DeliveryOverride.objects.filter(subscription__customer=customer, id=pk).first()
        if not override:
            return Response({'detail': 'Change not found.'}, status=status.HTTP_404_NOT_FOUND)
        if override.date < earliest_changeable_date(customer.dairy):
            return Response({'detail': cutoff_message(customer.dairy)}, status=status.HTTP_400_BAD_REQUEST)
        target = override.date
        override.hard_delete()
        refresh_manifests(customer.dairy, [target])
        return Response({'success': True, 'message': 'Back to your normal quantity.'})


class VacationPeriodViewSet(mixins.ListModelMixin, mixins.CreateModelMixin, mixins.DestroyModelMixin,
                            viewsets.GenericViewSet):
    """Customer pauses deliveries for a date range, or ends a pause."""
    serializer_class = VacationPeriodSerializer
    permission_classes = [IsCustomerUser]
    pagination_class = None

    def get_queryset(self):
        return VacationPeriod.objects.filter(customer=_customer(self.request), is_active=True)

    def get_serializer_context(self):
        return {**super().get_serializer_context(), 'customer': _customer(self.request)}

    def perform_create(self, serializer):
        customer = _customer(self.request)
        vacation = serializer.save(customer=customer)
        refresh_manifests(customer.dairy, date_range(vacation.start_date, min(vacation.end_date, vacation.start_date + timedelta(days=2))))

    def destroy(self, request, *args, **kwargs):
        vacation = self.get_object()
        customer = vacation.customer
        earliest = earliest_changeable_date(customer.dairy)
        if vacation.end_date < earliest:
            return Response({'detail': 'This vacation has already ended.'}, status=status.HTTP_400_BAD_REQUEST)
        if vacation.start_date >= earliest:
            vacation.is_active = False
            vacation.save(update_fields=['is_active', 'updated_at'])
            message = 'Vacation cancelled.'
        else:
            # Already started: end it on the last locked day so deliveries resume as soon as possible.
            vacation.end_date = earliest - timedelta(days=1)
            vacation.save(update_fields=['end_date', 'updated_at'])
            message = f"Deliveries resume on {earliest.strftime('%d %b')}."
        refresh_manifests(customer.dairy, [earliest])
        return Response({'success': True, 'message': message})


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """
    One-time extras (curd, paneer, extra milk).

    Customers order and cancel their own; dairies see orders for their dairy and
    mark them delivered or cancelled; admins can read everything.
    """
    serializer_class = OrderSerializer

    def get_queryset(self):
        user = self.request.user
        qs = Order.objects.select_related('product', 'customer__user')
        if user.role == 'customer':
            qs = qs.filter(customer=_customer(self.request))
        elif user.role == 'dairy' and hasattr(user, 'dairy'):
            qs = qs.filter(dairy=user.dairy)
        elif user.role != 'admin':
            return qs.none()

        params = self.request.query_params
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        if params.get('date'):
            qs = qs.filter(delivery_date=params['date'])
        if params.get('upcoming') == 'true':
            qs = qs.filter(delivery_date__gte=timezone.localdate())
        return qs

    @extend_schema(request=OrderCreateSerializer, responses={201: OrderSerializer})
    def create(self, request):
        if request.user.role != 'customer':
            return Response({'detail': 'Only customers can place orders.'}, status=status.HTTP_403_FORBIDDEN)
        customer = _customer(request)
        serializer = OrderCreateSerializer(data=request.data, context={'customer': customer})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        product = data['product']
        order = Order.objects.create(
            customer=customer,
            dairy=customer.dairy,
            product=product,
            quantity=data['quantity'],
            unit_price=product.price_per_unit,
            total_price=(data['quantity'] * product.price_per_unit).quantize(Decimal('0.01')),
            delivery_date=data['delivery_date'],
        )
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        if request.user.role != 'customer':
            return Response({'detail': 'Only the customer can cancel this way.'}, status=status.HTTP_403_FORBIDDEN)
        order = self.get_object()
        if order.status != Order.Status.PENDING:
            return Response({'detail': 'This order can no longer be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        if order.delivery_date < earliest_changeable_date(order.dairy):
            return Response({'detail': cutoff_message(order.dairy)}, status=status.HTTP_400_BAD_REQUEST)
        order.status = Order.Status.CANCELLED
        order.save(update_fields=['status', 'updated_at'])
        return Response(OrderSerializer(order).data)

    @extend_schema(request=OrderStatusSerializer, responses={200: OrderSerializer})
    @action(detail=True, methods=['post'], url_path='set-status')
    def set_status(self, request, pk=None):
        if request.user.role != 'dairy':
            return Response({'detail': 'Only the dairy can update order status.'}, status=status.HTTP_403_FORBIDDEN)
        order = self.get_object()
        serializer = OrderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if order.delivery_date > timezone.localdate() and serializer.validated_data['status'] == Order.Status.DELIVERED:
            return Response({'detail': 'Future orders cannot be marked delivered.'}, status=status.HTTP_400_BAD_REQUEST)
        order.status = serializer.validated_data['status']
        order.save(update_fields=['status', 'updated_at'])
        return Response(OrderSerializer(order).data)
