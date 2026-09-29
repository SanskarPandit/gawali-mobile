from django.db import models
from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy
from apps.deliveries.models import DailyDelivery

class Complaint(BaseModel):
    class Category(models.TextChoices):
        MISSED_DELIVERY = 'missed_delivery', 'Missed Delivery'
        MILK_QUALITY = 'milk_quality', 'Milk Quality / Curdled'
        QUANTITY_MISMATCH = 'quantity_mismatch', 'Incorrect Quantity'
        LATE_DELIVERY = 'late_delivery', 'Late Delivery'
        BILLING_ISSUE = 'billing_issue', 'Billing Issue'
        OTHER = 'other', 'Other Issue'

    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        IN_PROGRESS = 'in_progress', 'In Progress'
        RESOLVED = 'resolved', 'Resolved'
        CLOSED = 'closed', 'Closed'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='complaints')
    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='complaints')
    delivery = models.ForeignKey(DailyDelivery, on_delete=models.SET_NULL, null=True, blank=True, related_name='complaints')
    category = models.CharField(max_length=30, choices=Category.choices, default=Category.MISSED_DELIVERY)
    description = models.TextField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN, db_index=True)
    resolution_notes = models.TextField(blank=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = 'Complaint'
        verbose_name_plural = 'Complaints'
        ordering = ['-created_at']

    def __str__(self):
        return f"Complaint #{self.id}: {self.get_category_display()} by {self.customer.user.full_name} ({self.status})"
