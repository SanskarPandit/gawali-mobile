from datetime import datetime, timedelta
from decimal import Decimal

from django.db import models
from django.utils import timezone

from apps.core.models import BaseModel
from apps.dairies.models import Dairy

SAFE_TEMP_MIN = Decimal('2.8')
SAFE_TEMP_MAX = Decimal('4.2')


class MilkBatch(BaseModel):
    """
    A milking batch with its lab results and cold-chain log: the "Batch Purity Passport".

    `temperature_log` is a list of {"t": ISO datetime, "c": float, "phase": str} readings
    from the chilling, hub storage and transit sensors.
    """

    class Status(models.TextChoices):
        TESTING = 'testing', 'Lab testing'
        PASSED = 'passed', 'Passed & certified'
        FAILED = 'failed', 'Rejected'

    dairy = models.ForeignKey(Dairy, on_delete=models.CASCADE, related_name='batches')
    code = models.CharField(max_length=40, db_index=True)
    animal = models.CharField(max_length=20, default='cow')
    delivery_date = models.DateField(db_index=True, help_text='Morning this batch is delivered')
    hub_name = models.CharField(max_length=150)
    milked_at = models.DateTimeField()
    chilled_at = models.DateTimeField(help_text='When the milk first reached ≤ 4 °C')
    temperature_log = models.JSONField(default=list, blank=True)

    fat_percent = models.DecimalField(max_digits=4, decimal_places=2)
    snf_percent = models.DecimalField(max_digits=4, decimal_places=2)
    water_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    detergent_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    starch_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))
    urea_percent = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal('0'))

    lab_name = models.CharField(max_length=150, default='In-house FSSAI-accredited lab')
    certified_by = models.CharField(max_length=150, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PASSED, db_index=True)

    class Meta:
        ordering = ['-delivery_date', 'code']
        unique_together = ('dairy', 'code')

    def __str__(self):
        return f"{self.code} ({self.dairy.business_name}, {self.delivery_date})"

    @property
    def temperature_range(self):
        """Min/max from the moment the milk was chilled: the band the cold-chain promise covers."""
        threshold = self.chilled_at - timedelta(seconds=1)
        temps = []
        for r in self.temperature_log:
            try:
                t = datetime.fromisoformat(r['t'])
            except (KeyError, TypeError, ValueError):
                continue
            if timezone.is_naive(t):
                t = timezone.make_aware(t)
            if r.get('phase') != 'milking' and t >= threshold:
                temps.append(Decimal(str(r['c'])))
        return (min(temps), max(temps)) if temps else (None, None)

    @property
    def cold_chain_ok(self) -> bool:
        lo, hi = self.temperature_range
        return lo is not None and SAFE_TEMP_MIN <= lo and hi <= SAFE_TEMP_MAX

    @property
    def minutes_to_chill(self) -> int:
        return int((self.chilled_at - self.milked_at).total_seconds() // 60)

    @property
    def is_adulteration_free(self) -> bool:
        return all(v == 0 for v in (self.water_percent, self.detergent_percent, self.starch_percent, self.urea_percent))
