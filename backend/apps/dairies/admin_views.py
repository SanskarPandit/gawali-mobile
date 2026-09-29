from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Count
from apps.core.permissions import IsAdminUser
from apps.accounts.models import User
from apps.dairies.models import Dairy
from apps.customers.models import CustomerProfile
from apps.deliveries.models import DailyDelivery
from apps.billing.models import Bill

class AdminDashboardStatsView(APIView):
    """Platform owner dashboard intelligence (mirroring /admin in web app)."""
    permission_classes = [IsAdminUser]

    def get(self, request):
        today = timezone.localdate()
        start_of_month = today.replace(day=1)

        total_dairies = Dairy.objects.count()
        total_customers = CustomerProfile.objects.filter(is_active=True).count()

        # Today delivered volume across entire platform
        today_deliveries = DailyDelivery.objects.filter(delivery_date=today, status='delivered')
        today_delivered_vol = today_deliveries.aggregate(total=Sum('delivered_quantity'))['total'] or 0.0

        # Month platform GMV / revenue
        month_bills = Bill.objects.filter(billing_month__gte=start_of_month)
        month_revenue = month_bills.aggregate(total=Sum('total_amount'))['total'] or 0.0

        # Unpaid dues across all dairies
        unpaid_bills = Bill.objects.filter(due_amount__gt=0)
        unpaid_dues = unpaid_bills.aggregate(total=Sum('due_amount'))['total'] or 0.0

        # Gawali businesses directory with stats
        dairies_data = []
        for dairy in Dairy.objects.all().select_related('user'):
            cust_count = CustomerProfile.objects.filter(dairy=dairy, is_active=True).count()
            dboys_count = dairy.delivery_boys.filter(is_active=True).count()
            subs_count = dairy.customers.filter(subscriptions__status='active').distinct().count()

            # Dairy today volume
            d_today = DailyDelivery.objects.filter(
                subscription__customer__dairy=dairy,
                delivery_date=today,
                status='delivered'
            ).aggregate(total=Sum('delivered_quantity'))['total'] or 0.0

            # Dairy month revenue
            d_month = Bill.objects.filter(dairy=dairy, billing_month__gte=start_of_month).aggregate(total=Sum('total_amount'))['total'] or 0.0

            # Dairy unpaid
            d_unpaid = Bill.objects.filter(dairy=dairy, due_amount__gt=0).aggregate(total=Sum('due_amount'))['total'] or 0.0

            dairies_data.append({
                'id': str(dairy.id),
                'business_name': dairy.business_name,
                'owner_name': dairy.user.full_name,
                'owner_email': dairy.user.email,
                'phone': dairy.phone,
                'city': dairy.city,
                'is_verified': dairy.is_verified,
                'is_active': dairy.is_active,
                'customers_count': cust_count,
                'subscriptions_count': subs_count,
                'delivery_boys_count': dboys_count,
                'today_delivered_litres': float(d_today),
                'month_revenue': float(d_month),
                'unpaid_dues': float(d_unpaid),
            })

        return Response({
            'metrics': {
                'total_dairies': total_dairies,
                'total_customers': total_customers,
                'today_delivered_litres': float(today_delivered_vol),
                'month_revenue': float(month_revenue),
                'unpaid_dues': float(unpaid_dues),
            },
            'dairies': dairies_data
        })

class AdminUpdateDairyStatusView(APIView):
    """Admin can approve, verify, or suspend a dairy vendor."""
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        dairy = Dairy.objects.filter(id=pk).first()
        if not dairy:
            return Response({'detail': 'Dairy not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_active = request.data.get('is_active')
        is_verified = request.data.get('is_verified')

        if is_active is not None:
            if isinstance(is_active, str):
                is_active = is_active.lower() in ('true', '1')
            dairy.is_active = bool(is_active)
        if is_verified is not None:
            if isinstance(is_verified, str):
                is_verified = is_verified.lower() in ('true', '1')
            dairy.is_verified = bool(is_verified)
        dairy.save()

        return Response({
            'success': True,
            'message': f"Updated {dairy.business_name} status",
            'is_active': dairy.is_active,
            'is_verified': dairy.is_verified
        })
