from django.db import models
from django.conf import settings
from apps.core.models import BaseModel
from apps.dairies.models import Dairy, DeliveryRoute
from apps.subscriptions.models import Subscription

class DeliveryBoy(BaseModel):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='delivery_profile'
    )
    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='delivery_boys')
    vehicle_number = models.CharField(max_length=50, blank=True)
    assigned_route = models.ForeignKey(
        DeliveryRoute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='delivery_boys'
    )
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Delivery Boy'
        verbose_name_plural = 'Delivery Boys'
        ordering = ['user__full_name']

    def __str__(self):
        return f"{self.user.full_name} ({self.dairy.business_name})"

class DailyDelivery(BaseModel):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        DELIVERED = 'delivered', 'Delivered'
        SKIPPED = 'skipped', 'Skipped'
        MISSED = 'missed', 'Missed'

    subscription = models.ForeignKey(Subscription, on_delete=models.CASCADE, related_name='daily_deliveries')
    delivery_boy = models.ForeignKey(DeliveryBoy, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_deliveries')
    delivery_date = models.DateField(db_index=True)
    scheduled_quantity = models.DecimalField(max_digits=5, decimal_places=2)
    delivered_quantity = models.DecimalField(max_digits=5, decimal_places=2, default=0.0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    delivered_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='recorded_deliveries'
    )
    notes = models.TextField(blank=True)

    class Meta:
        verbose_name = 'Daily Delivery'
        verbose_name_plural = 'Daily Deliveries'
        unique_together = ('subscription', 'delivery_date')
        ordering = ['delivery_date', 'subscription__customer__route_stop_order']

    def __str__(self):
        return f"{self.delivery_date} - {self.subscription.customer.user.full_name}: {self.delivered_quantity}/{self.scheduled_quantity}L ({self.status})"
