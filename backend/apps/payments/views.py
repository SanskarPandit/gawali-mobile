from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from apps.core.permissions import IsCustomerUser
from apps.billing.models import Bill
from .models import Payment
from .serializers import (
    PaymentSerializer,
    InitiatePaymentSerializer,
    VerifyPaymentSerializer,
)
from .razorpay_client import razorpay_client

class InitiatePaymentView(APIView):
    """Customer initiates Razorpay UPI/Card/Netbanking payment for an outstanding bill."""
    permission_classes = [IsCustomerUser]

    def post(self, request):
        serializer = InitiatePaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        bill_id = serializer.validated_data['bill_id']

        bill = Bill.objects.filter(customer=request.user.customer_profile, id=bill_id).first()
        if not bill:
            return Response({'detail': 'Bill not found.'}, status=status.HTTP_404_NOT_FOUND)

        if bill.due_amount <= 0:
            return Response({'detail': 'Bill has already been paid in full.'}, status=status.HTTP_400_BAD_REQUEST)

        order_data = razorpay_client.create_order(
            amount_in_rupees=bill.due_amount,
            receipt=f"receipt_{str(bill.id)[:8]}",
            notes={
                'bill_id': str(bill.id),
                'customer_id': str(bill.customer.id),
                'customer_name': bill.customer.user.full_name
            }
        )

        # Create pending Payment record
        payment = Payment.objects.create(
            bill=bill,
            customer=bill.customer,
            amount=bill.due_amount,
            payment_method='upi',
            razorpay_order_id=order_data['id'],
            status='pending'
        )

        return Response({
            'success': True,
            'razorpay_order_id': order_data['id'],
            'amount_in_rupees': float(bill.due_amount),
            'amount_in_paise': order_data['amount'],
            'currency': 'INR',
            'key_id': razorpay_client.key_id,
            'payment_id': str(payment.id),
            'customer': {
                'name': bill.customer.user.full_name,
                'email': bill.customer.user.email,
                'phone': bill.customer.user.phone or ''
            }
        })

class VerifyPaymentView(APIView):
    """Verifies Razorpay HMAC signature and settles bill immediately."""
    permission_classes = [IsCustomerUser]

    def post(self, request):
        serializer = VerifyPaymentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        bill = Bill.objects.filter(customer=request.user.customer_profile, id=data['bill_id']).first()
        if not bill:
            return Response({'detail': 'Bill not found.'}, status=status.HTTP_404_NOT_FOUND)

        is_valid = razorpay_client.verify_payment_signature(
            order_id=data['razorpay_order_id'],
            payment_id=data['razorpay_payment_id'],
            signature=data['razorpay_signature']
        )

        if not is_valid:
            return Response({'detail': 'Payment signature verification failed.'}, status=status.HTTP_400_BAD_REQUEST)

        payment = Payment.objects.filter(
            bill=bill,
            razorpay_order_id=data['razorpay_order_id']
        ).first()

        if not payment:
            payment = Payment(bill=bill, customer=bill.customer, amount=bill.due_amount)

        payment.razorpay_payment_id = data['razorpay_payment_id']
        payment.razorpay_signature = data['razorpay_signature']
        payment.status = 'success'
        payment.paid_at = timezone.now()
        payment.save()

        # Update bill settlement
        bill.paid_amount += payment.amount
        bill.paid_at = timezone.now()
        bill.recalculate_due()

        return Response({
            'success': True,
            'message': 'Payment successful! Bill settled.',
            'payment': PaymentSerializer(payment).data,
            'bill': {
                'id': str(bill.id),
                'status': bill.status,
                'due_amount': float(bill.due_amount)
            }
        })

class CustomerPaymentHistoryView(generics.ListAPIView):
    """Customer payment receipts history."""
    serializer_class = PaymentSerializer
    permission_classes = [IsCustomerUser]

    def get_queryset(self):
        return Payment.objects.filter(
            customer=self.request.user.customer_profile,
            status='success'
        ).order_by('-paid_at')
