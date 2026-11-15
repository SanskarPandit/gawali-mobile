"""Business-day rules shared by subscriptions, vacations, overrides and one-time orders."""
from datetime import date, datetime, time, timedelta
from typing import Iterable

from django.conf import settings
from django.utils import timezone

MAX_DAILY_QUANTITY = 20
MAX_PLANNING_DAYS = 90


def dairy_cutoff(dairy) -> time:
    if dairy is not None and dairy.cutoff_time:
        return dairy.cutoff_time
    return datetime.strptime(settings.DEFAULT_CUTOFF_TIME, '%H:%M:%S').time()


def earliest_changeable_date(dairy) -> date:
    """
    First date a customer may still change.

    Tomorrow's manifest locks at the dairy's cutoff time tonight; after that the
    earliest changeable day is the day after tomorrow. Today is always locked.
    """
    now = timezone.localtime()
    tomorrow = now.date() + timedelta(days=1)
    return tomorrow if now.time() <= dairy_cutoff(dairy) else tomorrow + timedelta(days=1)


def cutoff_message(dairy) -> str:
    return (
        f"Changes for tomorrow closed at {dairy_cutoff(dairy).strftime('%I:%M %p')}. "
        f"The earliest date you can change is {earliest_changeable_date(dairy).strftime('%d %b')}."
    )


def refresh_manifests(dairy, dates: Iterable[date]) -> None:
    """Re-sync generated delivery rows for dates that already have a manifest (today/tomorrow)."""
    from apps.deliveries.services import generate_daily_deliveries

    today = timezone.localdate()
    for d in sorted(set(dates)):
        if today <= d <= today + timedelta(days=1):
            generate_daily_deliveries(d, dairy=dairy)


def date_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]
