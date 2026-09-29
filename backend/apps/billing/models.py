from django.db import models
from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy

class Bill(BaseModel):
    class Status(models.TextChoices):
        GENERATED = 'generated', 'Generated'
        PARTIALLY_PAID = 'partially_paid', 'Partially Paid'
        PAID = 'paid', 'Paid'
        OVERDUE = 'overdue', 'Overdue'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='bills')
    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='bills')
    billing_month = models.DateField(db_index=True, help_text="First date of the billing month e.g. 2026-09-01")
    total_quantity = models.DecimalField(max_digits=8, decimal_places=2, default=0.0)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    paid_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    due_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.GENERATED, db_index=True)
    due_date = models.DateField(null=True, blank=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    pdf_file = models.FileField(upload_to='bills/pdf/', null=True, blank=True)

    class Meta:
        verbose_name = 'Bill'
        verbose_name_plural = 'Bills'
        unique_together = ('customer', 'billing_month')
        ordering = ['-billing_month', '-created_at']

    def __str__(self):
        return f"Bill for {self.customer.user.full_name} - {self.billing_month.strftime('%B %Y')}: ₹{self.total_amount} ({self.status})"

    def recalculate_due(self):
        self.due_amount = max(0, self.total_amount - self.paid_amount)
        if self.due_amount == 0 and self.total_amount > 0:
            self.status = self.Status.PAID
        elif self.paid_amount > 0:
            self.status = self.Status.PARTIALLY_PAID
        self.save(update_fields=['due_amount', 'status'])

class BillItem(BaseModel):
    bill = models.ForeignKey(Bill, on_delete=models.CASCADE, related_name='items')
    date = models.DateField(db_index=True)
    item_name = models.CharField(max_length=200)
    quantity = models.DecimalField(max_digits=6, decimal_places=2)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        verbose_name = 'Bill Item'
        verbose_name_plural = 'Bill Items'
        ordering = ['date', 'created_at']

    def __str__(self):
        return f"{self.date}: {self.item_name} ({self.quantity} @ ₹{self.unit_price} = ₹{self.total_amount})"
