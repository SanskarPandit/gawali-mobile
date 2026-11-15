import logging

from celery import shared_task
from django.utils import timezone

from .services import generate_daily_deliveries

logger = logging.getLogger(__name__)


def generate_daily_deliveries_for_date(target_date=None, dairy=None):
    target_date = target_date or timezone.localdate()
    result = generate_daily_deliveries(target_date, dairy=dairy)
    logger.info('Daily deliveries for %s: %s', target_date, result)
    return result


@shared_task
def generate_daily_deliveries_task():
    """Celery scheduled task running at 00:05 AM."""
    return generate_daily_deliveries_for_date(timezone.localdate())
