from django.db import models
from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile
from apps.products.models import Product
from apps.dairies.models import Dairy

class Subscription(BaseModel):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'
        CANCELLED = 'cancelled', 'Cancelled'

    class TimeSlot(models.TextChoices):
        MORNING = 'morning', 'Morning (5:30 AM - 7:30 AM)'
        EVENING = 'evening', 'Evening (5:30 PM - 7:30 PM)'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='subscriptions')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='subscriptions')
    default_quantity = models.DecimalField(max_digits=5, decimal_places=2, default=1.00)
    delivery_time_slot = models.CharField(max_length=20, choices=TimeSlot.choices, default=TimeSlot.MORNING)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)

    class Meta:
        verbose_name = 'Subscription'
        verbose_name_plural = 'Subscriptions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.customer.user.full_name} - {self.default_quantity} {self.product.unit} {self.product.name}"

class DeliveryOverride(BaseModel):
    class OverrideType(models.TextChoices):
        SKIP = 'skip', 'Skip Day'
        DOUBLE = 'double', 'Double Quantity'
        CUSTOM = 'custom', 'Custom Quantity'

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='overrides')
    date = models.DateField(db_index=True)
    quantity = models.DecimalField(max_digits=5, decimal_places=2) # 0 means skipped
    override_type = models.CharField(max_length=20, choices=OverrideType.choices, default=OverrideType.CUSTOM)
    reason = models.CharField(max_length=255, blank=True)

    class Meta:
        verbose_name = 'Delivery Override'
        verbose_name_plural = 'Delivery Overrides'
        unique_together = ('subscription', 'date')
        ordering = ['date']

    def __str__(self):
        return f"{self.subscription.customer.user.full_name} - {self.date}: {self.quantity}L ({self.override_type})"

class VacationPeriod(BaseModel):
    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='vacations')
    start_date = models.DateField(db_index=True)
    end_date = models.DateField(db_index=True)
    reason = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Vacation Period'
        verbose_name_plural = 'Vacation Periods'
        ordering = ['-start_date']

    def __str__(self):
        return f"{self.customer.user.full_name} vacation: {self.start_date} to {self.end_date}"

class Order(BaseModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        DELIVERED = 'delivered', 'Delivered'
        CANCELLED = 'cancelled', 'Cancelled'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='orders')
    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='orders')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='orders')
    quantity = models.DecimalField(max_digits=5, decimal_places=2, default=1.0)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_price = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_date = models.DateField(db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)

    class Meta:
        verbose_name = 'One-time Order'
        verbose_name_plural = 'One-time Orders'
        ordering = ['-delivery_date', '-created_at']

    def save(self, *args, **kwargs):
        if not self.total_price:
            self.total_price = self.quantity * self.unit_price
        super().save(*args, **kwargs)

    def __str__(self):
        return f"Order #{self.id}: {self.quantity} x {self.product.name} for {self.customer.user.full_name}"
