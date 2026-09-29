from django.db import models
from apps.core.models import BaseModel
from apps.dairies.models import Dairy

class Product(BaseModel):
    class Kind(models.TextChoices):
        SUBSCRIPTION = 'subscription', 'Subscription (Daily)'
        ONE_TIME = 'one_time', 'One-time Order (Extras)'

    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=50, default='L', help_text="e.g. L, 500g, pack, kg")
    price_per_unit = models.DecimalField(max_digits=10, decimal_places=2)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.SUBSCRIPTION)
    is_available = models.BooleanField(default=True)
    description = models.TextField(blank=True)
    image_url = models.URLField(max_length=500, blank=True, null=True)

    class Meta:
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        ordering = ['kind', 'name']

    def __str__(self):
        return f"{self.name} - ₹{self.price_per_unit}/{self.unit} ({self.dairy.business_name})"
