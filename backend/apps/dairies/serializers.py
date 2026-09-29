from rest_framework import serializers
from .models import Dairy, DeliveryRoute

class DeliveryRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryRoute
        fields = ['id', 'dairy', 'name', 'description', 'sort_order', 'created_at']
        read_only_fields = ['id', 'dairy', 'created_at']

class DairySerializer(serializers.ModelSerializer):
    owner_name = serializers.CharField(source='user.full_name', read_only=True)
    owner_email = serializers.EmailField(source='user.email', read_only=True)
    routes = DeliveryRouteSerializer(many=True, read_only=True)

    class Meta:
        model = Dairy
        fields = [
            'id', 'user', 'owner_name', 'owner_email', 'business_name', 'phone',
            'address', 'city', 'state', 'pincode', 'cutoff_time', 'billing_cycle',
            'is_verified', 'is_active', 'bank_upi_id', 'routes', 'created_at'
        ]
        read_only_fields = ['id', 'user', 'created_at']

class DairyPublicSerializer(serializers.ModelSerializer):
    """Public representation for customer selection during onboarding."""
    class Meta:
        model = Dairy
        fields = ['id', 'business_name', 'phone', 'city', 'cutoff_time']
