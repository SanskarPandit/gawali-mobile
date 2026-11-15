from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class StoredFile(UUIDModel, TimeStampedModel):
    """
    Uploaded files (delivery proof, refund evidence) kept in Postgres instead of local disk,
    so every app server sees the same files and redeploys never lose them.
    """
    name = models.CharField(max_length=300, unique=True)
    content = models.BinaryField()
    content_type = models.CharField(max_length=100, default='application/octet-stream')
    size = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.name} ({self.size} bytes)'


class DeviceToken(UUIDModel, TimeStampedModel):
    """A browser or phone that can receive push notifications for a user (Firebase Cloud Messaging)."""

    class Platform(models.TextChoices):
        WEB = 'web', 'Web browser'
        ANDROID = 'android', 'Android'
        IOS = 'ios', 'iOS'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='device_tokens')
    token = models.CharField(max_length=500, unique=True)
    platform = models.CharField(max_length=10, choices=Platform.choices, default=Platform.WEB)
    is_active = models.BooleanField(default=True, db_index=True)
    last_error = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f'{self.user} · {self.platform}'


class JobRun(UUIDModel, TimeStampedModel):
    """
    One execution of a scheduled job for one period. The unique (job, period) pair is the lock that
    stops two scheduler processes (or a restart) from running the same job twice.
    """

    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        OK = 'ok', 'Succeeded'
        FAILED = 'failed', 'Failed'

    job = models.CharField(max_length=60, db_index=True)
    period = models.CharField(max_length=60)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    finished_at = models.DateTimeField(null=True, blank=True)
    detail = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ('job', 'period')

    def __str__(self):
        return f'{self.job} [{self.period}] {self.status}'
