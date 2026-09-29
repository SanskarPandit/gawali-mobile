from rest_framework import generics, viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum, Q, F
from datetime import datetime
from apps.core.permissions import IsDairyUser, IsAdminUser
from .models import Dairy, DeliveryRoute
from .serializers import DairySerializer, DairyPublicSerializer, DeliveryRouteSerializer

class PublicDairyListView(generics.ListAPIView):
    """Allows customers to find their local milk vendor/dairy."""
    queryset = Dairy.objects.filter(is_active=True, is_verified=True)
    serializer_class = DairyPublicSerializer
    permission_classes = [permissions.AllowAny]

class DairyProfileView(generics.RetrieveUpdateAPIView):
    """Retrieve or update dairy vendor profile and cutoff settings."""
    serializer_class = DairySerializer
    permission_classes = [IsDairyUser]

    def get_object(self):
        return self.request.user.dairy

class DairyDashboardView(APIView):
    """Enterprise dashboard metrics for Dairy/Vendor."""
    permission_classes = [IsDairyUser]

    def get(self, request):
        dairy = request.user.dairy
        today = timezone.localdate()

        # Import lazily to avoid circular dependencies
        from apps.deliveries.models import DailyDelivery
        from apps.billing.models import Bill
        from apps.customers.models import CustomerProfile

        # 1. Today's Delivery Metrics
        today_deliveries = DailyDelivery.objects.filter(
            subscription__customer__dairy=dairy,
            delivery_date=today
        )
        today_total_litres = today_deliveries.aggregate(total=Sum('scheduled_quantity'))['total'] or 0.0
        today_delivered_count = today_deliveries.filter(status='delivered').count()
        today_total_customers = today_deliveries.count()

        # 2. Customer Counts
        total_customers = CustomerProfile.objects.filter(dairy=dairy, is_active=True).count()

        # 3. Monthly Financials
        start_of_month = today.replace(day=1)
        month_bills = Bill.objects.filter(dairy=dairy, billing_month=start_of_month)
        month_earned = month_bills.aggregate(total=Sum('total_amount'))['total'] or 0.0

        # Total outstanding dues across all past unpaid/overdue bills
        unpaid_bills = Bill.objects.filter(dairy=dairy, due_amount__gt=0)
        total_outstanding = unpaid_bills.aggregate(total=Sum('due_amount'))['total'] or 0.0

        # 4. Overdue Customers list (for one-tap Call / WhatsApp reminder)
        overdue_customers_data = []
        for bill in unpaid_bills.select_related('customer__user').order_by('-due_amount')[:10]:
            cust_user = bill.customer.user
            phone = cust_user.phone or ''
            clean_phone = phone.replace('+', '').replace('-', '').replace(' ', '')
            whatsapp_msg = (
                f"Namaste {cust_user.full_name}, your milk bill from {dairy.business_name} "
                f"for Rs.{bill.due_amount:.2f} is pending. Kindly clear the bill. Thank you!"
            )
            import urllib.parse
            encoded_msg = urllib.parse.quote(whatsapp_msg)
            whatsapp_url = f"https://wa.me/91{clean_phone}?text={encoded_msg}" if clean_phone else None

            overdue_customers_data.append({
                'bill_id': str(bill.id),
                'customer_id': str(bill.customer.id),
                'customer_name': cust_user.full_name,
                'phone': phone,
                'address': bill.customer.address,
                'due_amount': float(bill.due_amount),
                'billing_month': bill.billing_month.strftime('%B %Y'),
                'whatsapp_url': whatsapp_url,
                'call_phone': phone
            })

        return Response({
            'business_name': dairy.business_name,
            'today': today.isoformat(),
            'today_volume_litres': float(today_total_litres),
            'today_delivered_count': today_delivered_count,
            'today_total_deliveries': today_total_customers,
            'total_active_customers': total_customers,
            'this_month_earned': float(month_earned),
            'total_outstanding_dues': float(total_outstanding),
            'cutoff_time': dairy.cutoff_time.strftime('%H:%M:%S'),
            'overdue_customers': overdue_customers_data
        })

class DeliveryRouteViewSet(viewsets.ModelViewSet):
    serializer_class = DeliveryRouteSerializer
    permission_classes = [IsDairyUser]

    def get_queryset(self):
        return DeliveryRoute.objects.filter(dairy=self.request.user.dairy)

    def perform_create(self, serializer):
        serializer.save(dairy=self.request.user.dairy)
