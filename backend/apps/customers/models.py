from django.db import models
from django.conf import settings
from apps.core.models import BaseModel
from apps.dairies.models import Dairy, DeliveryRoute

class CustomerProfile(BaseModel):
    class Language(models.TextChoices):
        ENGLISH = 'en', 'English'
        HINDI = 'hi', 'Hindi'
        MARATHI = 'mr', 'Marathi'

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='customer_profile'
    )
    dairy = models.ForeignKey(
        Dairy,
        on_delete=models.PROTECT,
        related_name='customers',
        null=True,
        blank=True
    )
    delivery_route = models.ForeignKey(
        DeliveryRoute,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='customers'
    )
    address = models.TextField()
    flat_or_house_number = models.CharField(max_length=100, blank=True)
    landmark = models.CharField(max_length=200, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    delivery_instructions = models.TextField(blank=True, help_text="e.g. Leave at door, ring bell twice")
    preferred_language = models.CharField(max_length=10, choices=Language.choices, default=Language.ENGLISH)
    dark_mode_enabled = models.BooleanField(default=False)
    route_stop_order = models.PositiveIntegerField(default=0, help_text="Sequential stop sequence for morning delivery")
    is_active = models.BooleanField(default=True)

    class Meta:
        verbose_name = 'Customer Profile'
        verbose_name_plural = 'Customer Profiles'
        ordering = ['route_stop_order', 'user__full_name']

    def __str__(self):
        return f"{self.user.full_name} - {self.dairy.business_name if self.dairy else 'No Dairy'}"
