from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Q
from apps.core.permissions import IsCustomerUser, IsDairyUser
from apps.dairies.models import Dairy
from .models import CustomerProfile
from .serializers import CustomerProfileSerializer, CustomerSetupSerializer

class CustomerProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = CustomerProfileSerializer
    permission_classes = [IsCustomerUser]

    def get_object(self):
        profile, created = CustomerProfile.objects.get_or_create(user=self.request.user)
        return profile

class CustomerSetupView(APIView):
    """Customer initial setup: selects dairy, product, quantity, and address."""
    permission_classes = [IsCustomerUser]

    def post(self, request):
        serializer = CustomerSetupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        dairy = Dairy.objects.get(id=data['dairy_id'])
        profile, _ = CustomerProfile.objects.get_or_create(user=request.user)
        profile.dairy = dairy
        profile.address = data['address']
        profile.delivery_instructions = data.get('delivery_instructions', '')
        if data.get('latitude') and data.get('longitude'):
            profile.latitude = data['latitude']
            profile.longitude = data['longitude']
        profile.save()

        # Create active subscription
        from apps.products.models import Product
        from apps.subscriptions.models import Subscription

        product = Product.objects.get(id=data['product_id'], dairy=dairy)
        sub, _ = Subscription.objects.update_or_create(
            customer=profile,
            defaults={
                'product': product,
                'default_quantity': data['default_quantity'],
                'status': 'active',
                'start_date': timezone.localdate()
            }
        )

        return Response({
            'success': True,
            'message': 'Subscription setup successfully!',
            'profile': CustomerProfileSerializer(profile).data
        })

class CustomerDashboardView(APIView):
    """Customer dashboard view with today's status, cycle total, and next delivery."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        user = request.user
        profile, _ = CustomerProfile.objects.get_or_create(user=user)
        today = timezone.localdate()

        from apps.deliveries.models import DailyDelivery
        from apps.billing.models import Bill
        from apps.subscriptions.models import Subscription

        # Active subscription
        subscription = Subscription.objects.filter(customer=profile, status='active').first()

        # Today's delivery record
        today_delivery = DailyDelivery.objects.filter(
            subscription__customer=profile,
            delivery_date=today
        ).first()

        # Month so far spending
        start_of_month = today.replace(day=1)
        delivered_this_month = DailyDelivery.objects.filter(
            subscription__customer=profile,
            delivery_date__gte=start_of_month,
            delivery_date__lte=today,
            status='delivered'
        )
        total_delivered_qty = delivered_this_month.aggregate(total=Sum('delivered_quantity'))['total'] or 0.0
        
        # Calculate approximate month-to-date bill
        unit_price = float(subscription.product.price_per_unit) if subscription and subscription.product else 0.0
        this_month_spent = float(total_delivered_qty) * unit_price

        # Current outstanding unpaid bill
        latest_unpaid_bill = Bill.objects.filter(customer=profile, due_amount__gt=0).order_by('-billing_month').first()

        return Response({
            'customer_name': user.full_name,
            'today': today.isoformat(),
            'dairy_name': profile.dairy.business_name if profile.dairy else None,
            'subscription': {
                'id': str(subscription.id) if subscription else None,
                'product_name': subscription.product.name if subscription and subscription.product else None,
                'default_quantity': float(subscription.default_quantity) if subscription else 0.0,
                'unit': subscription.product.unit if subscription and subscription.product else 'L',
                'price_per_unit': unit_price,
            } if subscription else None,
            'today_delivery': {
                'status': today_delivery.status if today_delivery else 'pending',
                'scheduled_quantity': float(today_delivery.scheduled_quantity) if today_delivery else (float(subscription.default_quantity) if subscription else 0.0),
                'delivered_quantity': float(today_delivery.delivered_quantity) if today_delivery else 0.0,
                'delivered_at': today_delivery.delivered_at.isoformat() if today_delivery and today_delivery.delivered_at else None,
            },
            'this_month_so_far': {
                'delivered_litres': float(total_delivered_qty),
                'estimated_amount': round(this_month_spent, 2)
            },
            'unpaid_bill': {
                'bill_id': str(latest_unpaid_bill.id),
                'month': latest_unpaid_bill.billing_month.strftime('%B %Y'),
                'due_amount': float(latest_unpaid_bill.due_amount),
            } if latest_unpaid_bill else None
        })

class DairyCustomerListView(generics.ListAPIView):
    """Vendor's view of all active customers with outstanding dues and search."""
    serializer_class = CustomerProfileSerializer
    permission_classes = [IsDairyUser]

    def get_queryset(self):
        dairy = self.request.user.dairy
        queryset = CustomerProfile.objects.filter(dairy=dairy, is_active=True).select_related('user', 'delivery_route')
        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(user__full_name__icontains=search) |
                Q(user__phone__icontains=search) |
                Q(address__icontains=search)
            )
        route_id = self.request.query_params.get('route_id')
        if route_id:
            queryset = queryset.filter(delivery_route_id=route_id)
        return queryset

class DairyCustomerDetailView(APIView):
    """Detailed ledger and stats for a single customer under this dairy."""
    permission_classes = [IsDairyUser]

    def get(self, request, pk):
        dairy = request.user.dairy
        profile = CustomerProfile.objects.filter(dairy=dairy, id=pk).select_related('user').first()
        if not profile:
            return Response({'detail': 'Customer not found.'}, status=status.HTTP_404_NOT_FOUND)

        from apps.deliveries.models import DailyDelivery
        from apps.billing.models import Bill
        from apps.subscriptions.models import Subscription

        # Subscriptions
        subscription = Subscription.objects.filter(customer=profile, status='active').first()

        # Lifetime stats
        lifetime_deliveries = DailyDelivery.objects.filter(subscription__customer=profile, status='delivered')
        lifetime_delivered_qty = lifetime_deliveries.aggregate(total=Sum('delivered_quantity'))['total'] or 0.0

        all_bills = Bill.objects.filter(customer=profile)
        lifetime_paid = all_bills.aggregate(total=Sum('paid_amount'))['total'] or 0.0
        total_outstanding = all_bills.aggregate(total=Sum('due_amount'))['total'] or 0.0

        # This month stats
        start_of_month = timezone.localdate().replace(day=1)
        this_month_deliveries = lifetime_deliveries.filter(delivery_date__gte=start_of_month)
        this_month_qty = this_month_deliveries.aggregate(total=Sum('delivered_quantity'))['total'] or 0.0
        unit_price = float(subscription.product.price_per_unit) if subscription and subscription.product else 0.0
        this_month_amount = float(this_month_qty) * unit_price

        # Recent deliveries
        recent_delivs = DailyDelivery.objects.filter(subscription__customer=profile).order_by('-delivery_date')[:10]
        recent_delivs_data = [{
            'id': str(d.id),
            'date': d.delivery_date.isoformat(),
            'scheduled_quantity': float(d.scheduled_quantity),
            'delivered_quantity': float(d.delivered_quantity),
            'status': d.status
        } for d in recent_delivs]

        # Past bills
        bills_data = [{
            'id': str(b.id),
            'month': b.billing_month.strftime('%B %Y'),
            'total_amount': float(b.total_amount),
            'paid_amount': float(b.paid_amount),
            'due_amount': float(b.due_amount),
            'status': b.status,
            'is_paid': b.due_amount <= 0
        } for b in all_bills.order_by('-billing_month')[:6]]

        return Response({
            'customer': CustomerProfileSerializer(profile).data,
            'metrics': {
                'outstanding': float(total_outstanding),
                'this_month_delivered': float(this_month_qty),
                'this_month_amount': round(this_month_amount, 2),
                'lifetime_delivered': float(lifetime_delivered_qty),
                'lifetime_paid': float(lifetime_paid),
            },
            'subscription': {
                'product_name': subscription.product.name if subscription and subscription.product else None,
                'default_quantity': float(subscription.default_quantity) if subscription else 0.0,
                'price_per_unit': unit_price,
                'unit': subscription.product.unit if subscription and subscription.product else 'L',
            } if subscription else None,
            'recent_deliveries': recent_delivs_data,
            'bills': bills_data
        })
