from decimal import Decimal

from rest_framework import serializers

from apps.dairies.models import DeliveryRoute
from .models import DeliveryBoy, DailyDelivery


class DeliveryBoySerializer(serializers.ModelSerializer):
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    account_active = serializers.BooleanField(source='user.is_active', read_only=True)
    route_name = serializers.CharField(source='assigned_route.name', read_only=True, default=None)

    class Meta:
        model = DeliveryBoy
        fields = [
            'id', 'full_name', 'phone', 'email', 'account_active', 'dairy',
            'vehicle_number', 'assigned_route', 'route_name', 'is_active', 'created_at',
        ]
        read_only_fields = ['id', 'dairy', 'is_active', 'created_at']


class DeliveryBoyUpdateSerializer(serializers.ModelSerializer):
    """What a dairy may change about its gawalis: route assignment and vehicle."""

    assigned_route = serializers.PrimaryKeyRelatedField(
        queryset=DeliveryRoute.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = DeliveryBoy
        fields = ['assigned_route', 'vehicle_number']

    def validate_assigned_route(self, route):
        if route is not None and route.dairy_id != self.instance.dairy_id:
            raise serializers.ValidationError('Route not found.')
        return route


class DailyDeliverySerializer(serializers.ModelSerializer):
    customer_id = serializers.UUIDField(source='subscription.customer.id', read_only=True)
    customer_name = serializers.CharField(source='subscription.customer.user.full_name', read_only=True)
    customer_phone = serializers.CharField(source='subscription.customer.user.phone', read_only=True)
    customer_address = serializers.CharField(source='subscription.customer.address', read_only=True)
    flat_or_house = serializers.CharField(source='subscription.customer.flat_or_house_number', read_only=True)
    landmark = serializers.CharField(source='subscription.customer.landmark', read_only=True)
    delivery_instructions = serializers.CharField(source='subscription.customer.delivery_instructions', read_only=True)
    latitude = serializers.DecimalField(source='subscription.customer.latitude', max_digits=10, decimal_places=7, read_only=True)
    longitude = serializers.DecimalField(source='subscription.customer.longitude', max_digits=10, decimal_places=7, read_only=True)
    route_id = serializers.UUIDField(source='subscription.customer.delivery_route_id', read_only=True, default=None)
    route_name = serializers.CharField(source='subscription.customer.delivery_route.name', read_only=True, default=None)
    product_name = serializers.CharField(source='subscription.product.name', read_only=True)
    product_unit = serializers.CharField(source='subscription.product.unit', read_only=True)
    stop_order = serializers.IntegerField(source='subscription.customer.route_stop_order', read_only=True)

    class Meta:
        model = DailyDelivery
        fields = [
            'id', 'delivery_date', 'scheduled_quantity', 'delivered_quantity',
            'status', 'delivered_at', 'status_updated_at', 'notes', 'customer_id', 'customer_name',
            'customer_phone', 'customer_address', 'flat_or_house', 'landmark',
            'delivery_instructions', 'latitude', 'longitude', 'route_id', 'route_name',
            'product_name', 'product_unit', 'stop_order',
        ]
        read_only_fields = fields


class DeliveryStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=DailyDelivery.Status.choices, required=False)
    delivered_quantity = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True)
    notes = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    client_updated_at = serializers.DateTimeField(required=False)

    def validate(self, attrs):
        if not any(k in attrs for k in ('status', 'delivered_quantity', 'notes')):
            raise serializers.ValidationError('Nothing to update.')
        return attrs


class DeliverySyncItemSerializer(DeliveryStatusUpdateSerializer):
    id = serializers.UUIDField()
    client_updated_at = serializers.DateTimeField()


class DeliverySyncSerializer(serializers.Serializer):
    updates = DeliverySyncItemSerializer(many=True, allow_empty=False, max_length=500)
