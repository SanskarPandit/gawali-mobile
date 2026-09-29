from rest_framework import serializers
from .models import Subscription, DeliveryOverride, VacationPeriod, Order
from apps.products.serializers import ProductSerializer

class SubscriptionSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.UUIDField(write_only=True)

    class Meta:
        model = Subscription
        fields = [
            'id', 'customer', 'product', 'product_id', 'default_quantity',
            'delivery_time_slot', 'status', 'start_date', 'end_date', 'created_at'
        ]
        read_only_fields = ['id', 'customer', 'created_at']

class DeliveryOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryOverride
        fields = ['id', 'subscription', 'date', 'quantity', 'override_type', 'reason', 'created_at']
        read_only_fields = ['id', 'subscription', 'created_at']

class VacationPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = VacationPeriod
        fields = ['id', 'customer', 'start_date', 'end_date', 'reason', 'is_active', 'created_at']
        read_only_fields = ['id', 'customer', 'created_at']

    def validate(self, attrs):
        if attrs['start_date'] > attrs['end_date']:
            raise serializers.ValidationError('Start date must be before end date.')
        return attrs

class OrderSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit = serializers.CharField(source='product.unit', read_only=True)
    customer_name = serializers.CharField(source='customer.user.full_name', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'dairy', 'product', 'product_name',
            'product_unit', 'quantity', 'unit_price', 'total_price',
            'delivery_date', 'status', 'created_at'
        ]
        read_only_fields = ['id', 'customer', 'dairy', 'unit_price', 'total_price', 'created_at']
