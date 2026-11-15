from django.db import models
from django.conf import settings
from apps.core.models import BaseModel

class Dairy(BaseModel):
    class BillingCycle(models.TextChoices):
        MONTHLY = 'monthly', 'Monthly'
        WEEKLY = 'weekly', 'Weekly'
        FORTNIGHTLY = 'fortnightly', 'Fortnightly'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='dairy'
    )
    business_name = models.CharField(max_length=255)
    phone = models.CharField(max_length=20)
    address = models.TextField()
    city = models.CharField(max_length=100, default='Pune')
    state = models.CharField(max_length=100, default='Maharashtra')
    pincode = models.CharField(max_length=10, blank=True)
    cutoff_time = models.TimeField(default='22:00:00')
    billing_cycle = models.CharField(max_length=20, choices=BillingCycle.choices, default=BillingCycle.MONTHLY)
    is_verified = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    bank_upi_id = models.CharField(max_length=100, blank=True, help_text='VPA / UPI ID for direct customer payment')
    hub_name = models.CharField(max_length=150, blank=True, help_text='Collection / chilling hub shown on purity passports')
    slot_start = models.TimeField(default='05:30:00')
    slot_end = models.TimeField(default='06:15:00')
    bottle_deposit = models.DecimalField(max_digits=6, decimal_places=2, default=10, help_text='Refundable deposit per glass bottle')
    pouch_eco_credit = models.DecimalField(max_digits=6, decimal_places=2, default=5, help_text='Wallet credit per 10 returned pouches')
    credit_limit = models.DecimalField(max_digits=8, decimal_places=2, default=1500,
                                       help_text='Most a household may owe before deliveries are held')
    hold_on_dues = models.BooleanField(default=True, help_text='Hold next-day deliveries once dues pass the credit limit')
    cutoff_reminders = models.BooleanField(default=True, help_text='Push a reminder an hour before cutoff')

    class Meta:
        verbose_name = 'Dairy'
        verbose_name_plural = 'Dairies'
        ordering = ['business_name']

    def __str__(self):
        return f"{self.business_name} ({self.city})"

class DeliveryRoute(BaseModel):
    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='routes')
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True)
    sort_order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['sort_order', 'name']
        unique_together = ('dairy', 'name')

    def __str__(self):
        return f"{self.name} - {self.dairy.business_name}"
