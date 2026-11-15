from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from apps.accounts.models import User
from .models import DailyDelivery

MAX_DELIVERY_QUANTITY = Decimal('50')
UPDATABLE_STATUSES = {
    DailyDelivery.Status.PENDING,
    DailyDelivery.Status.DELIVERED,
    DailyDelivery.Status.SKIPPED,
    DailyDelivery.Status.MISSED,
}


class DeliveryUpdateError(Exception):
    """A delivery update the caller is not allowed to make or that is invalid."""

    def __init__(self, message: str, code: str = 'invalid'):
        super().__init__(message)
        self.message = message
        self.code = code


def sync_window_days() -> int:
    return int(getattr(settings, 'DELIVERY_SYNC_WINDOW_DAYS', 2))


def deliveries_visible_to(user: User) -> QuerySet:
    """The deliveries a user may read or change. Everything else is invisible to them."""
    qs = DailyDelivery.objects.select_related(
        'subscription__customer__user',
        'subscription__customer__delivery_route',
        'subscription__product',
    )
    if user.role == User.Role.ADMIN or user.is_superuser:
        return qs
    if user.role == User.Role.DAIRY and hasattr(user, 'dairy'):
        return qs.filter(subscription__customer__dairy=user.dairy)
    if user.role == User.Role.DELIVERY_BOY and hasattr(user, 'delivery_profile'):
        profile = user.delivery_profile
        if not profile.is_active:
            return qs.none()
        qs = qs.filter(subscription__customer__dairy=profile.dairy)
        if profile.assigned_route_id:
            qs = qs.filter(subscription__customer__delivery_route_id=profile.assigned_route_id)
        return qs
    return qs.none()


@dataclass
class DeliveryUpdate:
    status: str | None = None
    delivered_quantity: Decimal | None = None
    notes: str | None = None
    # When the change was made on the device. Offline updates arrive late; this decides who wins.
    client_updated_at: datetime | None = None


def parse_quantity(value) -> Decimal | None:
    if value is None or value == '':
        return None
    try:
        qty = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise DeliveryUpdateError('Quantity must be a number.')
    if qty < 0 or qty > MAX_DELIVERY_QUANTITY:
        raise DeliveryUpdateError(f'Quantity must be between 0 and {MAX_DELIVERY_QUANTITY}.')
    return qty.quantize(Decimal('0.01'))


@transaction.atomic
def apply_delivery_update(delivery: DailyDelivery, user: User, update: DeliveryUpdate) -> tuple[DailyDelivery, bool]:
    """
    Apply a status/quantity change. Returns (delivery, applied).

    `applied` is False when the change is older than what the server already has
    (last write wins by the time the change was made, not the time it arrived).
    """
    delivery = DailyDelivery.objects.select_for_update().get(pk=delivery.pk)
    today = timezone.localdate()

    if delivery.delivery_date > today:
        raise DeliveryUpdateError('Future deliveries cannot be marked yet.', 'future_date')
    if user.role != User.Role.ADMIN and delivery.delivery_date < today - timedelta(days=sync_window_days()):
        raise DeliveryUpdateError('This delivery is too old to change. Ask the dairy to correct it.', 'too_old')

    if update.status is not None and update.status not in UPDATABLE_STATUSES:
        raise DeliveryUpdateError(f"Unknown status '{update.status}'.")

    changed_at = update.client_updated_at or timezone.now()
    if changed_at > timezone.now() + timedelta(minutes=5):
        changed_at = timezone.now()  # never trust a device clock that runs ahead
    if delivery.status_updated_at and changed_at < delivery.status_updated_at:
        return delivery, False

    if update.status is not None:
        delivery.status = update.status
        if update.status == DailyDelivery.Status.DELIVERED:
            delivery.delivered_at = changed_at
            delivery.delivered_by = user
            if update.delivered_quantity is None:
                delivery.delivered_quantity = delivery.scheduled_quantity
        elif update.status in (DailyDelivery.Status.SKIPPED, DailyDelivery.Status.MISSED):
            delivery.delivered_quantity = Decimal('0')
            delivery.delivered_at = None
        else:  # back to pending
            delivery.delivered_quantity = Decimal('0')
            delivery.delivered_at = None
            delivery.delivered_by = None

    if update.delivered_quantity is not None:
        if delivery.status != DailyDelivery.Status.DELIVERED:
            raise DeliveryUpdateError('Quantity can only be recorded for a delivered stop.')
        delivery.delivered_quantity = update.delivered_quantity

    if update.notes is not None:
        delivery.notes = update.notes[:1000]

    delivery.status_updated_at = changed_at
    delivery.save()
    return delivery, True


def generate_daily_deliveries(target_date: date, dairy=None) -> dict:
    """
    Make sure every active subscription has a delivery row for `target_date`.

    Safe to call repeatedly: rows that already exist are only refreshed while
    still pending (to pick up a late skip or quantity change). Delivered,
    skipped or missed rows are never touched.
    """
    from apps.subscriptions.models import DeliveryOverride, Subscription, VacationPeriod

    subs = Subscription.objects.filter(
        status=Subscription.Status.ACTIVE,
        start_date__lte=target_date,
        customer__is_active=True,
        customer__dairy__isnull=False,
    ).filter(models_q_end_date(target_date)).select_related('customer__delivery_route', 'customer__dairy')
    if dairy is not None:
        subs = subs.filter(customer__dairy=dairy)

    sub_ids = [s.id for s in subs]
    overrides = {o.subscription_id: o for o in DeliveryOverride.objects.filter(subscription_id__in=sub_ids, date=target_date)}
    on_vacation = set(
        VacationPeriod.objects.filter(
            customer__subscriptions__id__in=sub_ids,
            is_active=True,
            start_date__lte=target_date,
            end_date__gte=target_date,
        ).values_list('customer_id', flat=True)
    )
    existing = {d.subscription_id: d for d in DailyDelivery.objects.filter(subscription_id__in=sub_ids, delivery_date=target_date)}

    from apps.core.scheduling import earliest_changeable_date

    lock_cache: dict = {}

    def is_locked(customer) -> bool:
        # Rows before the customer's earliest changeable date are frozen (e.g. today after it was planned).
        key = customer.dairy_id
        if key not in lock_cache:
            lock_cache[key] = target_date < earliest_changeable_date(customer.dairy)
        return lock_cache[key]

    created = refreshed = 0
    for sub in subs:
        if sub.customer_id in on_vacation:
            qty, status = Decimal('0'), DailyDelivery.Status.SKIPPED
        elif sub.id in overrides:
            qty = overrides[sub.id].quantity
            status = DailyDelivery.Status.SKIPPED if qty == 0 else DailyDelivery.Status.PENDING
        else:
            qty, status = sub.default_quantity, DailyDelivery.Status.PENDING

        current = existing.get(sub.id)
        if current is None:
            route = sub.customer.delivery_route
            DailyDelivery.objects.create(
                subscription=sub,
                delivery_date=target_date,
                scheduled_quantity=qty,
                delivered_quantity=Decimal('0'),
                status=status,
                delivery_boy=route.delivery_boys.filter(is_active=True).first() if route else None,
            )
            created += 1
        elif not is_locked(sub.customer) and current.status_updated_at is None and current.status in (
            DailyDelivery.Status.PENDING,
            DailyDelivery.Status.SKIPPED,
        ):
            # Only rows nobody has acted on yet follow later plan changes (skips, vacations, quantity).
            if current.scheduled_quantity != qty or current.status != status:
                current.scheduled_quantity = qty
                current.status = status
                current.save(update_fields=['scheduled_quantity', 'status', 'updated_at'])
                refreshed += 1

    return {'created': created, 'refreshed': refreshed}


def models_q_end_date(target_date: date):
    from django.db.models import Q

    return Q(end_date__isnull=True) | Q(end_date__gte=target_date)
