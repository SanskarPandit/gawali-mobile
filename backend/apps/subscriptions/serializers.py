from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import serializers

from apps.core.scheduling import MAX_DAILY_QUANTITY, MAX_PLANNING_DAYS, earliest_changeable_date
from apps.products.models import Product
from apps.products.serializers import ProductSerializer
from .models import DeliveryOverride, Order, Subscription, VacationPeriod


class SubscriptionSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)

    class Meta:
        model = Subscription
        fields = [
            'id', 'customer', 'product', 'default_quantity',
            'delivery_time_slot', 'status', 'start_date', 'end_date', 'created_at',
        ]
        read_only_fields = fields


class PlanUpdateSerializer(serializers.Serializer):
    """Change to a daily plan. Customers may pause/resume; dairies may also cancel."""
    product_id = serializers.UUIDField(required=False)
    default_quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.25'), max_value=Decimal(MAX_DAILY_QUANTITY), required=False
    )
    delivery_time_slot = serializers.ChoiceField(choices=Subscription.TimeSlot.choices, required=False)
    status = serializers.ChoiceField(choices=Subscription.Status.choices, required=False)

    def validate_status(self, value):
        if value == Subscription.Status.CANCELLED and not self.context.get('can_cancel'):
            raise serializers.ValidationError('Contact your dairy to cancel the plan.')
        return value

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('Nothing to update.')
        return attrs


class PlanCreateSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    default_quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.25'), max_value=Decimal(MAX_DAILY_QUANTITY)
    )
    delivery_time_slot = serializers.ChoiceField(choices=Subscription.TimeSlot.choices, default='morning')
    start_date = serializers.DateField(required=False)


class DeliveryOverrideSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeliveryOverride
        fields = ['id', 'subscription', 'date', 'quantity', 'override_type', 'reason', 'created_at']
        read_only_fields = fields


class SetOverrideSerializer(serializers.Serializer):
    date = serializers.DateField()
    quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0'), max_value=Decimal(MAX_DAILY_QUANTITY)
    )
    reason = serializers.CharField(required=False, allow_blank=True, max_length=255)


class VacationPeriodSerializer(serializers.ModelSerializer):
    class Meta:
        model = VacationPeriod
        fields = ['id', 'start_date', 'end_date', 'reason', 'is_active', 'created_at']
        read_only_fields = ['id', 'is_active', 'created_at']

    def validate(self, attrs):
        start = attrs.get('start_date', getattr(self.instance, 'start_date', None))
        end = attrs.get('end_date', getattr(self.instance, 'end_date', None))
        dairy = self.context['customer'].dairy
        earliest = earliest_changeable_date(dairy)

        if start is None or end is None:
            raise serializers.ValidationError('Start and end dates are required.')
        if start > end:
            raise serializers.ValidationError({'end_date': 'End date must be on or after the start date.'})
        if start < earliest:
            raise serializers.ValidationError({'start_date': f"The earliest you can pause is {earliest.strftime('%d %b')}."})
        if (end - start).days + 1 > MAX_PLANNING_DAYS:
            raise serializers.ValidationError({'end_date': f'A vacation can be at most {MAX_PLANNING_DAYS} days.'})

        overlapping = VacationPeriod.objects.filter(
            customer=self.context['customer'], is_active=True, start_date__lte=end, end_date__gte=start
        )
        if self.instance:
            overlapping = overlapping.exclude(pk=self.instance.pk)
        if overlapping.exists():
            raise serializers.ValidationError('This overlaps another vacation.')
        return attrs


class OrderSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_unit = serializers.CharField(source='product.unit', read_only=True)
    customer_name = serializers.CharField(source='customer.user.full_name', read_only=True)
    customer_address = serializers.CharField(source='customer.address', read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'customer', 'customer_name', 'customer_address', 'dairy', 'product', 'product_name',
            'product_unit', 'quantity', 'unit_price', 'total_price',
            'delivery_date', 'status', 'created_at',
        ]
        read_only_fields = fields


class OrderCreateSerializer(serializers.Serializer):
    product = serializers.UUIDField()
    quantity = serializers.DecimalField(
        max_digits=5, decimal_places=2, min_value=Decimal('0.5'), max_value=Decimal(MAX_DAILY_QUANTITY)
    )
    delivery_date = serializers.DateField()

    def validate(self, attrs):
        customer = self.context['customer']
        if customer.dairy_id is None:
            raise serializers.ValidationError('Choose your dairy before ordering.')
        product = Product.objects.filter(
            id=attrs['product'], dairy=customer.dairy, kind=Product.Kind.ONE_TIME, is_available=True
        ).first()
        if product is None:
            raise serializers.ValidationError({'product': 'This item is not available from your dairy.'})
        earliest = earliest_changeable_date(customer.dairy)
        latest = timezone.localdate() + timedelta(days=30)
        if not earliest <= attrs['delivery_date'] <= latest:
            raise serializers.ValidationError(
                {'delivery_date': f"Pick a date between {earliest.strftime('%d %b')} and {latest.strftime('%d %b')}."}
            )
        attrs['product'] = product
        return attrs


class OrderStatusSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=[Order.Status.DELIVERED, Order.Status.CANCELLED])
