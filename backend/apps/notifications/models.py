from django.db import models
from django.conf import settings
from apps.core.models import BaseModel

class Notification(BaseModel):
    class NotificationType(models.TextChoices):
        CUTOFF_REMINDER = 'cutoff_reminder', 'Cutoff Reminder'
        DELIVERY_CONFIRMATION = 'delivery_done', 'Delivery Confirmation'
        BILL_GENERATED = 'bill_generated', 'Bill Generated'
        PAYMENT_RECEIVED = 'payment_received', 'Payment Received'
        COMPLAINT_UPDATE = 'complaint_update', 'Complaint Update'
        GENERAL = 'general', 'General Announcement'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    title = models.CharField(max_length=200)
    body = models.TextField()
    notification_type = models.CharField(max_length=30, choices=NotificationType.choices, default=NotificationType.GENERAL)
    data = models.JSONField(default=dict, blank=True)
    is_read = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']

    def __str__(self):
        return f"Notification for {self.user.full_name}: {self.title}"
