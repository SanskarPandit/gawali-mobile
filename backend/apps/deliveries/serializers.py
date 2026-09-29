from rest_framework import serializers
from .models import DeliveryBoy, DailyDelivery
from apps.accounts.serializers import UserSerializer

class DeliveryBoySerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    route_name = serializers.CharField(source='assigned_route.name', read_only=True)

    class Meta:
        model = DeliveryBoy
        fields = ['id', 'user', 'full_name', 'phone', 'email', 'dairy', 'vehicle_number', 'assigned_route', 'route_name', 'is_active', 'created_at']
        read_only_fields = ['id', 'dairy', 'created_at']

class CreateDeliveryBoySerializer(serializers.Serializer):
    full_name = serializers.CharField(required=True)
    phone = serializers.CharField(required=True)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(required=True, min_length=6)
    vehicle_number = serializers.CharField(required=False, allow_blank=True)
    assigned_route_id = serializers.UUIDField(required=False, allow_null=True)

class DailyDeliverySerializer(serializers.ModelSerializer):
    customer_id = serializers.UUIDField(source='subscription.customer.id', read_only=True)
    customer_name = serializers.CharField(source='subscription.customer.user.full_name', read_only=True)
    customer_phone = serializers.CharField(source='subscription.customer.user.phone', read_only=True)
    customer_address = serializers.CharField(source='subscription.customer.address', read_only=True)
    flat_or_house = serializers.CharField(source='subscription.customer.flat_or_house_number', read_only=True)
    delivery_instructions = serializers.CharField(source='subscription.customer.delivery_instructions', read_only=True)
    latitude = serializers.DecimalField(source='subscription.customer.latitude', max_digits=10, decimal_places=7, read_only=True)
    longitude = serializers.DecimalField(source='subscription.customer.longitude', max_digits=10, decimal_places=7, read_only=True)
    product_name = serializers.CharField(source='subscription.product.name', read_only=True)
    product_unit = serializers.CharField(source='subscription.product.unit', read_only=True)
    stop_order = serializers.IntegerField(source='subscription.customer.route_stop_order', read_only=True)

    class Meta:
        model = DailyDelivery
        fields = [
            'id', 'delivery_date', 'scheduled_quantity', 'delivered_quantity',
            'status', 'delivered_at', 'notes', 'customer_id', 'customer_name',
            'customer_phone', 'customer_address', 'flat_or_house',
            'delivery_instructions', 'latitude', 'longitude', 'product_name',
            'product_unit', 'stop_order'
        ]
        read_only_fields = ['id', 'delivery_date', 'scheduled_quantity']
