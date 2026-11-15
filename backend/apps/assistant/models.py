from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class AIInteraction(UUIDModel, TimeStampedModel):
    """
    Every model call, kept as a training/evaluation dataset.

    `label` is filled in when a human decision confirms or overrides the model (e.g. a dairy
    approving a refund the vision model flagged, or a customer confirming a proposed action).
    `python manage.py export_ai_dataset` writes labelled rows as JSONL for fine-tuning or evals.
    """

    class Label(models.TextChoices):
        NONE = '', 'Unlabelled'
        CORRECT = 'correct', 'Model was right'
        WRONG = 'wrong', 'Model was wrong'

    task = models.CharField(max_length=20, db_index=True)
    model = models.CharField(max_length=120)
    prompt = models.JSONField(default=list)
    output = models.TextField(blank=True)
    latency_ms = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=500, blank=True)
    context = models.JSONField(default=dict, blank=True)
    label = models.CharField(max_length=10, choices=Label.choices, blank=True, default='', db_index=True)
    label_note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.task} · {self.model} · {self.latency_ms} ms'
