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

    class Category(models.TextChoices):
        MILK = 'milk', 'Milk'
        CURD = 'curd', 'Curd & Yogurt'
        PANEER = 'paneer', 'Paneer'
        GHEE = 'ghee', 'Ghee & Butter'
        BAKERY = 'bakery', 'Bread & Bakery'
        EGGS = 'eggs', 'Eggs'
        OTHER = 'other', 'Other Essentials'

    class Container(models.TextChoices):
        GLASS_BOTTLE = 'glass_bottle', 'Glass Bottle'
        POUCH = 'pouch', 'Pouch'
        TUB = 'tub', 'Tub'
        PACK = 'pack', 'Pack'

    class Animal(models.TextChoices):
        COW = 'cow', 'Cow'
        A2_COW = 'a2_cow', 'A2 Cow'
        BUFFALO = 'buffalo', 'Buffalo'
        NONE = 'none', 'Not applicable'

    category = models.CharField(max_length=20, choices=Category.choices, default=Category.MILK, db_index=True)
    container = models.CharField(max_length=20, choices=Container.choices, default=Container.POUCH)
    animal = models.CharField(max_length=20, choices=Animal.choices, default=Animal.NONE)
    quantity_step = models.DecimalField(max_digits=4, decimal_places=2, default=1, help_text='Stepper increment, e.g. 0.5 for half-litres')
    fat_percent = models.DecimalField(max_digits=4, decimal_places=2, null=True, blank=True)
    is_new = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Product'
        verbose_name_plural = 'Products'
        ordering = ['kind', 'name']

    def __str__(self):
        return f"{self.name} - ₹{self.price_per_unit}/{self.unit} ({self.dairy.business_name})"
