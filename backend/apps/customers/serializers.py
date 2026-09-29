from decimal import Decimal
from rest_framework import serializers
from .models import CustomerProfile
from apps.accounts.serializers import UserSerializer

class CustomerProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    dairy_name = serializers.CharField(source='dairy.business_name', read_only=True)
    route_name = serializers.CharField(source='delivery_route.name', read_only=True)

    class Meta:
        model = CustomerProfile
        fields = [
            'id', 'user', 'full_name', 'phone', 'email', 'dairy', 'dairy_name',
            'delivery_route', 'route_name', 'address', 'flat_or_house_number',
            'landmark', 'latitude', 'longitude', 'delivery_instructions',
            'preferred_language', 'dark_mode_enabled', 'route_stop_order', 'is_active', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']

class CustomerSetupSerializer(serializers.Serializer):
    """Initial onboarding payload for a customer connecting to a dairy."""
    dairy_id = serializers.UUIDField(required=True)
    product_id = serializers.UUIDField(required=True)
    default_quantity = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=Decimal('0.25'))
    address = serializers.CharField(required=True)
    delivery_instructions = serializers.CharField(required=False, allow_blank=True)
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
