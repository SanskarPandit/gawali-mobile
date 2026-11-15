from django.db import models

from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile
from apps.deliveries.models import DailyDelivery


class RefundClaim(BaseModel):
    """A photo-verified "issue with today's milk" claim, credited to the wallet within seconds."""

    class Issue(models.TextChoices):
        LEAKED = 'leaked', 'Leaked / Broken Seal'
        CURDLED = 'curdled', 'Curdled Upon Boiling'

    class Status(models.TextChoices):
        CREDITED = 'credited', 'Credited to wallet'
        UNDER_REVIEW = 'under_review', 'Under dairy review'
        REJECTED = 'rejected', 'Rejected'

    class Verdict(models.TextChoices):
        VERIFIED = 'verified', 'Damage verified'
        UNCLEAR = 'unclear', 'Unclear photo'
        MISMATCH = 'mismatch', 'Does not match the issue'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='refund_claims')
    delivery = models.ForeignKey(DailyDelivery, on_delete=models.CASCADE, related_name='refund_claims')
    issue = models.CharField(max_length=20, choices=Issue.choices)
    photo = models.FileField(upload_to='refunds/%Y/%m/')
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    status = models.CharField(max_length=20, choices=Status.choices, db_index=True)

    ai_verdict = models.CharField(max_length=20, choices=Verdict.choices)
    ai_confidence = models.DecimalField(max_digits=4, decimal_places=2, default=0)
    ai_observation = models.TextField(blank=True)
    ai_engine = models.CharField(max_length=120, blank=True, help_text='Model id, or "rules" when offline')
    processing_ms = models.PositiveIntegerField(default=0)

    reviewed_note = models.CharField(max_length=255, blank=True)
    credited_at = models.DateTimeField(null=True, blank=True)
    backup_order = models.ForeignKey(
        'subscriptions.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='refund_claims'
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.get_issue_display()} – {self.customer.user.full_name} ₹{self.amount} ({self.status})"
