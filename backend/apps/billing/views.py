from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Sum
from datetime import datetime, date
from apps.core.permissions import IsCustomerUser, IsDairyUser
from apps.customers.models import CustomerProfile
from .models import Bill, BillItem
from .serializers import BillSerializer
from .tasks import generate_bill_for_customer_month
from .pdf_generator import generate_bill_pdf_bytes

class CustomerBillsListView(APIView):
    """Customer view of their postpaid bills (mirroring /app/bills in web app)."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        profile = request.user.customer_profile
        bills = Bill.objects.filter(customer=profile).order_by('-billing_month')

        total_billed = bills.aggregate(total=Sum('total_amount'))['total'] or 0.0
        total_paid = bills.aggregate(total=Sum('paid_amount'))['total'] or 0.0
        total_due = bills.aggregate(total=Sum('due_amount'))['total'] or 0.0

        serializer = BillSerializer(bills, many=True, context={'request': request})

        return Response({
            'summary': {
                'total_billed': float(total_billed),
                'total_paid': float(total_paid),
                'total_due': float(total_due),
            },
            'bills': serializer.data
        })

class CustomerBillDetailView(generics.RetrieveAPIView):
    serializer_class = BillSerializer
    permission_classes = [IsCustomerUser]

    def get_queryset(self):
        return Bill.objects.filter(customer=self.request.user.customer_profile)

class DownloadBillPdfView(APIView):
    """Download PDF tax invoice for any bill."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, pk):
        bill = Bill.objects.filter(id=pk).first()
        if not bill:
            return Response({'detail': 'Bill not found.'}, status=status.HTTP_404_NOT_FOUND)

        # Ensure user has access
        user = request.user
        if user.role == 'customer' and bill.customer.user != user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)
        elif user.role == 'dairy' and bill.dairy.user != user:
            return Response({'detail': 'Permission denied.'}, status=status.HTTP_403_FORBIDDEN)

        pdf_bytes = generate_bill_pdf_bytes(bill)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        filename = f"bill_{bill.customer.user.full_name.replace(' ', '_')}_{bill.billing_month.strftime('%Y_%m')}.pdf"
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

class DairyGenerateBillView(APIView):
    """Vendor generates or regenerates a bill for a customer for a given month."""
    permission_classes = [IsDairyUser]

    def post(self, request, customer_id):
        dairy = request.user.dairy
        customer = CustomerProfile.objects.filter(dairy=dairy, id=customer_id).first()
        if not customer:
            return Response({'detail': 'Customer not found under this dairy.'}, status=status.HTTP_404_NOT_FOUND)

        month_str = request.data.get('month') # e.g. "2026-09" or "2026-09-01"
        if month_str:
            try:
                if len(month_str) == 7:
                    month_date = datetime.strptime(month_str, '%Y-%m').date()
                else:
                    month_date = datetime.strptime(month_str, '%Y-%m-%d').date()
                target_month_start = month_date.replace(day=1)
            except ValueError:
                target_month_start = timezone.localdate().replace(day=1)
        else:
            target_month_start = timezone.localdate().replace(day=1)

        bill = generate_bill_for_customer_month(customer, target_month_start)
        return Response({
            'success': True,
            'message': f"Bill generated for {target_month_start.strftime('%B %Y')}",
            'bill': BillSerializer(bill, context={'request': request}).data
        })

class DairyMarkBillPaidView(APIView):
    """Vendor records a cash or offline UPI payment received directly from customer."""
    permission_classes = [IsDairyUser]

    def post(self, request, pk):
        dairy = request.user.dairy
        bill = Bill.objects.filter(dairy=dairy, id=pk).first()
        if not bill:
            return Response({'detail': 'Bill not found.'}, status=status.HTTP_404_NOT_FOUND)

        amount = request.data.get('amount')
        is_full = request.data.get('mark_full', False)
        notes = request.data.get('notes', 'Cash / Direct UPI settlement')

        if is_full or amount is None:
            pay_amount = bill.due_amount
        else:
            pay_amount = min(bill.due_amount, float(amount))

        if pay_amount <= 0:
            return Response({'detail': 'Bill is already settled.'}, status=status.HTTP_400_BAD_REQUEST)

        # Record payment entity
        from apps.payments.models import Payment
        payment = Payment.objects.create(
            bill=bill,
            customer=bill.customer,
            amount=pay_amount,
            payment_method='cash',
            status='success',
            paid_at=timezone.now(),
            recorded_by='dairy_cash',
            notes=notes
        )

        bill.paid_amount += pay_amount
        bill.paid_at = timezone.now()
        bill.recalculate_due()

        return Response({
            'success': True,
            'message': f"Recorded ₹{pay_amount:.2f} payment for {bill.customer.user.full_name}",
            'bill': BillSerializer(bill, context={'request': request}).data
        })
