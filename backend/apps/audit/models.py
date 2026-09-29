from django.db import models
from django.conf import settings
from apps.core.models import UUIDModel, TimeStampedModel

class AuditLog(UUIDModel, TimeStampedModel):
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_actions'
    )
    action = models.CharField(max_length=100, db_index=True) # e.g. "AUTH_LOGIN", "SET_OVERRIDE", "BILL_PAID"
    entity_name = models.CharField(max_length=100, blank=True)
    entity_id = models.CharField(max_length=100, blank=True)
    details = models.JSONField(default=dict, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)

    class Meta:
        verbose_name = 'Audit Log'
        verbose_name_plural = 'Audit Logs'
        ordering = ['-created_at']

    def __str__(self):
        actor_name = self.actor.full_name if self.actor else 'System'
        return f"[{self.created_at.strftime('%Y-%m-%d %H:%M')}] {actor_name}: {self.action} ({self.entity_name})"
