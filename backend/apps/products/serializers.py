from rest_framework import serializers
from .models import Product

class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = [
            'id', 'dairy', 'name', 'unit', 'price_per_unit',
            'kind', 'is_available', 'description', 'image_url', 'created_at'
        ]
        read_only_fields = ['id', 'dairy', 'created_at']
