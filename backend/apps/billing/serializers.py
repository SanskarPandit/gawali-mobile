from rest_framework import serializers
from .models import Bill, BillItem

class BillItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = BillItem
        fields = ['id', 'date', 'item_name', 'quantity', 'unit_price', 'total_amount']

class BillSerializer(serializers.ModelSerializer):
    items = BillItemSerializer(many=True, read_only=True)
    customer_name = serializers.CharField(source='customer.user.full_name', read_only=True)
    dairy_name = serializers.CharField(source='dairy.business_name', read_only=True)
    month_name = serializers.SerializerMethodField()
    is_paid = serializers.SerializerMethodField()
    pdf_url = serializers.SerializerMethodField()

    class Meta:
        model = Bill
        fields = [
            'id', 'customer', 'customer_name', 'dairy', 'dairy_name',
            'billing_month', 'month_name', 'total_quantity', 'total_amount',
            'paid_amount', 'due_amount', 'status', 'due_date', 'paid_at',
            'pdf_url', 'is_paid', 'items', 'created_at'
        ]
        read_only_fields = ['id', 'created_at']

    def get_month_name(self, obj):
        return obj.billing_month.strftime('%B %Y')

    def get_is_paid(self, obj):
        return obj.due_amount <= 0

    def get_pdf_url(self, obj):
        if obj.pdf_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.pdf_file.url)
            return obj.pdf_file.url
        return None
