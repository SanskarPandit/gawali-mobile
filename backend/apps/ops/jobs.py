"""
Scheduled jobs. `python manage.py run_scheduler` checks every 30 s which jobs are due; each job
runs once per period, guarded by a unique JobRun row, so restarts or a second scheduler never
double-run anything. Times are in the dairy's local time zone (Asia/Kolkata).
"""
import logging
from decimal import Decimal
from dataclasses import dataclass
from datetime import datetime, time, timedelta
from typing import Callable

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone

from apps.core.scheduling import dairy_cutoff
from apps.dairies.models import Dairy
from apps.deliveries.models import DailyDelivery, DeliveryBoy
from apps.deliveries.services import generate_daily_deliveries
from apps.notifications.models import Notification
from . import billing
from .models import JobRun

logger = logging.getLogger(__name__)
CATCH_UP_UNTIL = time(3, 0)
MAX_ATTEMPTS = 3


@dataclass
class Job:
    name: str
    description: str
    due: Callable[[datetime, Dairy | None], bool]   # is it time yet (for this dairy)?
    run: Callable[[datetime, Dairy | None], dict]
    per_dairy: bool = True
    # Which day a run belongs to (the lock key). Default: today.
    period_date: Callable[[datetime], 'date'] | None = None


def _at(now, t: time) -> datetime:
    return timezone.make_aware(datetime.combine(now.date(), t), timezone.get_current_timezone())


def _minus(t: time, minutes: int) -> time:
    return (datetime.combine(datetime(2000, 1, 2), t) - timedelta(minutes=minutes)).time()


# --- job bodies ----------------------------------------------------------------------------

def manifest_today(now, dairy):
    return generate_daily_deliveries(now.date(), dairy=dairy)


def close_tomorrow(now, dairy):
    """At cutoff: apply credit holds, freeze tomorrow's manifest, tell partners their route size."""
    # Normally runs the evening of the cutoff; a catch-up run after midnight targets the same morning.
    tomorrow = now.date() + timedelta(days=1) if now.time() >= CATCH_UP_UNTIL else now.date()
    holds = billing.enforce_credit_holds(dairy, tomorrow)
    result = generate_daily_deliveries(tomorrow, dairy=dairy)
    stops = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=tomorrow,
                                         status=DailyDelivery.Status.PENDING)
    for p in DeliveryBoy.objects.filter(dairy=dairy, is_active=True).select_related('user', 'assigned_route'):
        mine = stops.filter(subscription__customer__delivery_route=p.assigned_route) if p.assigned_route_id else stops
        n = mine.values('subscription__customer').distinct().count()
        if n:
            Notification.objects.create(user=p.user, title="Tomorrow's route is locked",
                                        body=f'{n} stops on {p.assigned_route.name if p.assigned_route else "your route"}. Load sheet is ready in the app.')
    return {**result, **holds}


def cutoff_reminder(now, dairy):
    """An hour before cutoff, remind households that have a delivery tomorrow."""
    if not dairy.cutoff_reminders:
        return {'skipped': 'disabled by dairy'}
    tomorrow = now.date() + timedelta(days=1)
    generate_daily_deliveries(tomorrow, dairy=dairy)
    users = set(DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=tomorrow,
                                             status=DailyDelivery.Status.PENDING)
                .values_list('subscription__customer__user_id', flat=True))
    label = dairy_cutoff(dairy).strftime('%I:%M %p').lstrip('0')
    Notification.objects.bulk_create([Notification(
        user_id=u, title='Changes close in 1 hour',
        body=f"Skip, add or change tomorrow's order before {label}.",
        notification_type=Notification.NotificationType.CUTOFF_REMINDER) for u in users])
    from . import push
    push.send_async(users, 'Changes close in 1 hour', f"Skip, add or change tomorrow's order before {label}.", link='/app')
    return {'reminded': len(users)}


def morning_routes(now, dairy):
    """04:45: wake partners up with the size of today's route."""
    generate_daily_deliveries(now.date(), dairy=dairy)
    today = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=now.date(),
                                         status=DailyDelivery.Status.PENDING)
    sent = 0
    for p in DeliveryBoy.objects.filter(dairy=dairy, is_active=True).select_related('user', 'assigned_route'):
        mine = today.filter(subscription__customer__delivery_route=p.assigned_route) if p.assigned_route_id else today
        n = mine.values('subscription__customer').distinct().count()
        if n:
            Notification.objects.create(user=p.user, title='Good morning — your route is ready',
                                        body=f'{n} stops today. Slot {dairy.slot_start.strftime("%I:%M %p").lstrip("0")}. Open the app for the load sheet.')
            sent += 1
    return {'partners_notified': sent}


def auto_close_missed(now, dairy):
    """Noon: anything still pending from this morning becomes 'missed' (never charged) and both sides hear about it."""
    rows = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=now.date(),
                                        status=DailyDelivery.Status.PENDING, scheduled_quantity__gt=0)
    customers = set(rows.values_list('subscription__customer__user_id', flat=True))
    n = rows.update(status=DailyDelivery.Status.MISSED, delivered_quantity=0, status_updated_at=timezone.now(),
                    notes='Auto-closed at noon: not marked by the partner')
    for u in customers:
        Notification.objects.create(user_id=u, title="Today's delivery wasn't marked",
                                    body='Your partner did not confirm a drop today, so you have not been charged. Contact the dairy if you received it.',
                                    notification_type=Notification.NotificationType.DELIVERY_CONFIRMATION)
    if customers:
        Notification.objects.create(user=dairy.user, title=f'{len(customers)} stops auto-closed as missed',
                                    body='These were never marked by a partner this morning. Review them in Dispatch.')
    return {'closed_rows': n, 'households': len(customers)}


def dues_reminders(now, dairy):
    """19:00: a calm reminder to households that owe money; a warning when near or over the limit."""
    from apps.wallet.models import Wallet

    sent = 0
    for w in Wallet.objects.filter(customer__dairy=dairy, customer__is_active=True, balance__lt=0).select_related('customer__user'):
        due = -w.balance
        if due < 50:
            continue
        over = due >= dairy.credit_limit > 0
        near = not over and due >= dairy.credit_limit * Decimal('0.8')
        title = 'Payment due — deliveries on hold' if over else ('Almost at your credit limit' if near else 'Payment reminder')
        body = (f'₹{due:,.0f} is due to {dairy.business_name}. ' +
                ('Deliveries resume once you settle.' if over else
                 f'Your limit is ₹{dairy.credit_limit:,.0f}. Please settle soon to avoid a pause.' if near else
                 'Please settle with your dairy by cash or their UPI.'))
        # Gentle cadence: weekly unless near/over the limit.
        if not (over or near) and now.weekday() != 6:
            continue
        Notification.objects.create(user=w.customer.user, title=title, body=body,
                                    notification_type=Notification.NotificationType.BILL_GENERATED)
        sent += 1
    return {'reminded': sent}


def cleanup(now, _dairy):
    from rest_framework_simplejwt.token_blacklist.models import OutstandingToken
    from apps.assistant.models import AIInteraction

    return {
        'ai_logs': AIInteraction.objects.filter(created_at__lt=now - timedelta(days=90), label='').delete()[0],
        'job_runs': JobRun.objects.filter(created_at__lt=now - timedelta(days=30)).delete()[0],
        'expired_tokens': OutstandingToken.objects.filter(expires_at__lt=now).delete()[0],
        # Notification uses soft-delete; prune for real.
        'old_notifications': Notification.objects.filter(created_at__lt=now - timedelta(days=60), is_read=True).hard_delete()[0],
    }


JOBS = [
    # First, so a post-midnight catch-up applies holds before today's manifest is built.
    Job('close_tomorrow', "Freeze tomorrow's manifest at cutoff and apply credit holds",
        # After cutoff, or before 03:00 as a catch-up when ticks are hourly (counted against yesterday).
        lambda n, d: n.time() > dairy_cutoff(d) or n.time() < CATCH_UP_UNTIL, close_tomorrow,
        period_date=lambda n: n.date() - timedelta(days=1) if n.time() < CATCH_UP_UNTIL else n.date()),
    Job('manifest_today', "Build today's delivery manifest", lambda n, d: n.time() >= time(0, 5), manifest_today),
    Job('morning_routes', 'Tell partners their route is ready', lambda n, d: time(4, 45) <= n.time() < time(7, 0), morning_routes),
    Job('cutoff_reminder', 'Remind customers an hour before cutoff',
        lambda n, d: _minus(dairy_cutoff(d), 60) <= n.time() < dairy_cutoff(d), cutoff_reminder),
    Job('auto_close_missed', 'Close unmarked stops at noon', lambda n, d: n.time() >= time(12, 0), auto_close_missed),
    Job('dues_reminders', 'Payment reminders', lambda n, d: n.time() >= time(19, 0), dues_reminders),
    Job('cleanup', 'Prune old logs and tokens', lambda n, d: n.time() >= time(3, 0), cleanup, per_dairy=False),
]


def period_for(now, dairy, job: Job | None = None) -> str:
    """The lock key: one run per job per day (per dairy for per-dairy jobs)."""
    day = (job.period_date(now) if job and job.period_date else now.date()).isoformat()
    return f'{day}:{dairy.id}' if dairy else day


def run_due_jobs(now=None, only: str | None = None, dairies: list | None = None) -> list[dict]:
    now = timezone.localtime(now or timezone.now())
    if dairies is None:
        dairies = list(Dairy.objects.filter(is_active=True))
    results = []
    for job in JOBS:
        if only and job.name != only:
            continue
        targets = dairies if job.per_dairy else [None]
        for dairy in targets:
            try:
                if not job.due(now, dairy):
                    continue
            except Exception:
                continue
            period = period_for(now, dairy, job)
            try:
                with transaction.atomic():
                    run = JobRun.objects.create(job=job.name, period=period)
            except IntegrityError:
                # Already ran or running for this period. A failed run is retried, up to MAX_ATTEMPTS.
                with transaction.atomic():
                    run = JobRun.objects.select_for_update().filter(job=job.name, period=period).first()
                    attempts = int((run.detail or {}).get('attempts', 1)) if run else MAX_ATTEMPTS
                    if run is None or run.status != JobRun.Status.FAILED or attempts >= MAX_ATTEMPTS:
                        continue
                    run.status, run.detail = JobRun.Status.RUNNING, {'attempts': attempts + 1}
                    run.save(update_fields=['status', 'detail', 'updated_at'])
            try:
                detail = job.run(now, dairy) or {}
                attempts = (run.detail or {}).get('attempts', 1)
                run.status, run.detail = JobRun.Status.OK, {**{k: (str(v) if not isinstance(v, (int, float, str, bool, type(None))) else v)
                                                              for k, v in detail.items()}, 'attempts': attempts}
            except Exception as exc:
                logger.exception('Job %s failed for %s', job.name, period)
                run.status, run.detail = JobRun.Status.FAILED, {'error': str(exc)[:500], 'attempts': (run.detail or {}).get('attempts', 1)}
            run.finished_at = timezone.now()
            run.save(update_fields=['status', 'detail', 'finished_at', 'updated_at'])
            results.append({'job': job.name, 'period': period, 'status': run.status, **run.detail})
    return results
