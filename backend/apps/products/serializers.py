from decimal import Decimal

from rest_framework import serializers

from .models import Product


class ProductSerializer(serializers.ModelSerializer):
    price_per_unit = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0.01'), max_value=Decimal('100000')
    )

    class Meta:
        model = Product
        fields = [
            'id', 'dairy', 'name', 'unit', 'price_per_unit',
            'kind', 'is_available', 'description', 'image_url', 'created_at'
        ]
        read_only_fields = ['id', 'dairy', 'created_at']

    def validate_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a product name.')
        return value

    def validate_unit(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Enter a unit, e.g. L or 500g.')
        return value
