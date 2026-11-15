from decimal import Decimal

from rest_framework import serializers

from apps.accounts.models import User
from apps.core.scheduling import MAX_DAILY_QUANTITY
from apps.dairies.models import DeliveryRoute
from .models import CustomerProfile


class CustomerProfileSerializer(serializers.ModelSerializer):
    """Read model for a customer profile (customer's own view and the dairy's view)."""
    full_name = serializers.CharField(source='user.full_name', read_only=True)
    phone = serializers.CharField(source='user.phone', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    dairy_name = serializers.CharField(source='dairy.business_name', read_only=True, default=None)
    route_name = serializers.CharField(source='delivery_route.name', read_only=True, default=None)
    needs_onboarding = serializers.SerializerMethodField()

    class Meta:
        model = CustomerProfile
        fields = [
            'id', 'full_name', 'phone', 'email', 'dairy', 'dairy_name',
            'delivery_route', 'route_name', 'address', 'flat_or_house_number',
            'landmark', 'latitude', 'longitude', 'delivery_instructions',
            'preferred_language', 'dark_mode_enabled', 'route_stop_order', 'is_active',
            'needs_onboarding', 'created_at',
        ]
        read_only_fields = fields

    def get_needs_onboarding(self, obj):
        return obj.dairy_id is None or not obj.address


class CustomerSelfUpdateSerializer(serializers.ModelSerializer):
    """What customers may edit themselves. Dairy, route and status are managed by the dairy."""

    class Meta:
        model = CustomerProfile
        fields = [
            'address', 'flat_or_house_number', 'landmark', 'latitude', 'longitude',
            'delivery_instructions', 'preferred_language', 'dark_mode_enabled',
        ]

    def validate_address(self, value):
        if not value.strip():
            raise serializers.ValidationError('Address cannot be empty.')
        return value.strip()


class CustomerSetupSerializer(serializers.Serializer):
    """Customer onboarding: choose a dairy and a daily plan, and give the delivery address."""
    dairy_id = serializers.UUIDField()
    product_id = serializers.UUIDField()
    default_quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.25'), max_value=Decimal(MAX_DAILY_QUANTITY)
    )
    delivery_time_slot = serializers.ChoiceField(choices=['morning', 'evening'], default='morning')
    address = serializers.CharField(max_length=500)
    flat_or_house_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    landmark = serializers.CharField(max_length=200, required=False, allow_blank=True)
    delivery_instructions = serializers.CharField(required=False, allow_blank=True, max_length=500)
    latitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)
    longitude = serializers.DecimalField(max_digits=10, decimal_places=7, required=False, allow_null=True)


class DairyCustomerListSerializer(CustomerProfileSerializer):
    """Dairy's customer directory row with plan and dues."""
    plan = serializers.SerializerMethodField()
    outstanding = serializers.DecimalField(max_digits=10, decimal_places=2, read_only=True, default=Decimal('0'))

    class Meta(CustomerProfileSerializer.Meta):
        fields = CustomerProfileSerializer.Meta.fields + ['plan', 'outstanding']
        read_only_fields = fields

    def get_plan(self, obj):
        subs = [s for s in obj.subscriptions.all() if s.status in ('active', 'paused')]
        if not subs:
            return None
        s = subs[0]
        return {
            'subscription_id': str(s.id),
            'product_name': s.product.name,
            'unit': s.product.unit,
            'default_quantity': s.default_quantity,
            'status': s.status,
        }


class DairyCustomerCreateSerializer(serializers.Serializer):
    """A dairy adds a household: links an existing customer account or creates a new one."""
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    address = serializers.CharField(max_length=500)
    flat_or_house_number = serializers.CharField(max_length=100, required=False, allow_blank=True)
    landmark = serializers.CharField(max_length=200, required=False, allow_blank=True)
    delivery_instructions = serializers.CharField(required=False, allow_blank=True, max_length=500)
    delivery_route = serializers.UUIDField(required=False, allow_null=True)
    product_id = serializers.UUIDField()
    default_quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.25'), max_value=Decimal(MAX_DAILY_QUANTITY)
    )
    delivery_time_slot = serializers.ChoiceField(choices=['morning', 'evening'], default='morning')
    start_date = serializers.DateField(required=False)

    def validate_email(self, value):
        return value.lower().strip()

    def validate_phone(self, value):
        return value.replace(' ', '').replace('-', '')


class DairyCustomerUpdateSerializer(serializers.ModelSerializer):
    """Dairy edits a customer's delivery details and route placement."""
    delivery_route = serializers.PrimaryKeyRelatedField(
        queryset=DeliveryRoute.objects.all(), allow_null=True, required=False
    )

    class Meta:
        model = CustomerProfile
        fields = [
            'address', 'flat_or_house_number', 'landmark', 'latitude', 'longitude',
            'delivery_instructions', 'delivery_route', 'route_stop_order',
        ]

    def validate_delivery_route(self, route):
        if route is not None and route.dairy_id != self.instance.dairy_id:
            raise serializers.ValidationError('Route not found.')
        return route


class RouteReorderSerializer(serializers.Serializer):
    route_id = serializers.UUIDField(allow_null=True)
    customer_ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=1000)


def find_existing_customer_user(email: str, phone: str):
    """Returns (user, conflict_message). A match on either identifier must be the same customer."""
    by_email = User.objects.filter(email=email, is_deleted=False).first()
    by_phone = User.objects.filter(phone=phone, is_deleted=False).first() if phone else None
    if by_email and by_phone and by_email.pk != by_phone.pk:
        return None, 'This email and phone belong to two different accounts.'
    user = by_email or by_phone
    if user and user.role != User.Role.CUSTOMER:
        return None, 'This email or phone belongs to a non-customer account.'
    return user, None
