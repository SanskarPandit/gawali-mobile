from django.db import models
from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile
from apps.billing.models import Bill

class Payment(BaseModel):
    class Method(models.TextChoices):
        UPI = 'upi', 'UPI'
        CARD = 'card', 'Card'
        NETBANKING = 'netbanking', 'Netbanking'
        CASH = 'cash', 'Cash'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        SUCCESS = 'success', 'Success'
        FAILED = 'failed', 'Failed'

    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name='payments')
    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='payments')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    payment_method = models.CharField(max_length=20, choices=Method.choices, default=Method.UPI)
    razorpay_order_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    razorpay_payment_id = models.CharField(max_length=100, blank=True, null=True, db_index=True)
    razorpay_signature = models.CharField(max_length=255, blank=True, null=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    recorded_by = models.CharField(max_length=50, default='customer') # 'customer' or 'dairy_cash'
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'
        ordering = ['-created_at']

    def __str__(self):
        return f"Payment #{self.id} for ₹{self.amount} - {self.customer.user.full_name} ({self.status})"
