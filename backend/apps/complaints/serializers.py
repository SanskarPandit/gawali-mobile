from rest_framework import serializers
from .models import Complaint

class ComplaintSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source='customer.user.full_name', read_only=True)
    customer_phone = serializers.CharField(source='customer.user.phone', read_only=True)
    dairy_name = serializers.CharField(source='dairy.business_name', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)

    class Meta:
        model = Complaint
        fields = [
            'id', 'customer', 'customer_name', 'customer_phone',
            'dairy', 'dairy_name', 'delivery', 'category', 'category_display',
            'description', 'status', 'resolution_notes', 'resolved_at', 'created_at'
        ]
        read_only_fields = ['id', 'customer', 'dairy', 'resolved_at', 'created_at']

class ResolveComplaintSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['in_progress', 'resolved', 'closed'])
    resolution_notes = serializers.CharField(required=True)
