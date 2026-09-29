from rest_framework import serializers
from .models import Payment

class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = [
            'id', 'bill', 'customer', 'amount', 'payment_method',
            'razorpay_order_id', 'razorpay_payment_id', 'status',
            'paid_at', 'recorded_by', 'notes', 'created_at'
        ]
        read_only_fields = ['id', 'status', 'created_at']

class InitiatePaymentSerializer(serializers.Serializer):
    bill_id = serializers.UUIDField(required=True)

class VerifyPaymentSerializer(serializers.Serializer):
    bill_id = serializers.UUIDField(required=True)
    razorpay_order_id = serializers.CharField(required=True)
    razorpay_payment_id = serializers.CharField(required=True)
    razorpay_signature = serializers.CharField(required=True)
