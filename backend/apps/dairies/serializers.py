import re

from rest_framework import serializers
from .models import Dairy, DeliveryRoute

class DeliveryRouteSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryRoute
        fields = ['id', 'dairy', 'name', 'description', 'sort_order', 'created_at']
        read_only_fields = ['id', 'dairy', 'created_at']

    def validate_name(self, value):
        value = value.strip()
        dairy = self.context['request'].user.dairy
        clash = DeliveryRoute.objects.filter(dairy=dairy, name__iexact=value)
        if self.instance:
            clash = clash.exclude(pk=self.instance.pk)
        if clash.exists():
            raise serializers.ValidationError('You already have a route with this name.')
        return value

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
        # Verification and activation are controlled by platform admins only.
        read_only_fields = ['id', 'user', 'is_verified', 'is_active', 'created_at']

    def validate_business_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter the dairy name.')
        return value

    def validate_phone(self, value):
        cleaned = value.replace(' ', '').replace('-', '')
        if not re.fullmatch(r'\+?[0-9]{10,15}', cleaned):
            raise serializers.ValidationError('Enter a valid phone number.')
        return cleaned

    def validate_bank_upi_id(self, value):
        value = value.strip()
        if value and not re.fullmatch(r'[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}', value):
            raise serializers.ValidationError('Enter a valid UPI ID, e.g. dairyname@upi.')
        return value

    def validate_pincode(self, value):
        if value and not re.fullmatch(r'[1-9][0-9]{5}', value):
            raise serializers.ValidationError('Enter a 6-digit PIN code.')
        return value

class DairyPublicSerializer(serializers.ModelSerializer):
    """Public representation for customer selection during onboarding."""
    class Meta:
        model = Dairy
        fields = ['id', 'business_name', 'phone', 'city', 'cutoff_time']
