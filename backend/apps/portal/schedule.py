"""
What will (or did) reach a customer's door on each day.

Past days and today read the real delivery rows. Future days are projected with exactly
the rules `generate_daily_deliveries` applies (vacation > override > default quantity), so the
calendar ribbon, the hero card, the burn-rate and the vacation savings always agree with
the manifest the gawali will receive.
"""
import math
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.utils import timezone

from apps.core.scheduling import dairy_cutoff, earliest_changeable_date
from apps.deliveries.models import DailyDelivery
from apps.products.models import Product
from apps.subscriptions.models import DeliveryOverride, Order, Subscription, VacationPeriod
from apps.subscriptions.services import OPEN_STATUSES

ZERO = Decimal('0')


def fmt_time(t) -> str:
    return t.strftime('%I:%M %p').lstrip('0')


def cutoff_info(dairy) -> dict:
    """The next cutoff moment and which delivery day it governs."""
    now = timezone.localtime()
    cutoff_t = dairy_cutoff(dairy)
    today = now.date()
    locked_tonight = now.time() > cutoff_t
    cutoff_day = today + timedelta(days=1) if locked_tonight else today
    next_cutoff = timezone.make_aware(datetime.combine(cutoff_day, cutoff_t), timezone.get_current_timezone())
    return {
        'server_now': now.isoformat(),
        'cutoff_time': cutoff_t.strftime('%H:%M'),
        'cutoff_label': fmt_time(cutoff_t),
        'next_cutoff_at': next_cutoff.isoformat(),
        'governs_date': earliest_changeable_date(dairy).isoformat(),
        'tomorrow': (today + timedelta(days=1)).isoformat(),
        'tomorrow_locked': locked_tonight,
    }


def product_brief(p: Product) -> dict:
    return {
        'id': str(p.id), 'name': p.name, 'unit': p.unit, 'price': p.price_per_unit,
        'category': p.category, 'container': p.container, 'animal': p.animal,
        'step': p.quantity_step, 'image_url': p.image_url,
    }


@dataclass
class DayPlan:
    date: date
    status: str = 'none'  # none | scheduled | skipped | vacation | delivered | missed | paused
    locked: bool = False
    items: list = field(default_factory=list)
    orders: list = field(default_factory=list)
    amount: Decimal = ZERO
    bottles: int = 0
    proof_photo: str | None = None
    delivered_at: str | None = None
    batch_id: str | None = None

    def as_dict(self, request=None):
        # Media URLs stay relative so they resolve on whatever origin serves the app (dev proxy, LAN, production).
        photo = self.proof_photo
        return {
            'date': self.date.isoformat(), 'status': self.status, 'locked': self.locked,
            'items': self.items, 'orders': self.orders, 'amount': self.amount.quantize(Decimal('0.01')),
            'bottles': self.bottles, 'proof_photo': photo, 'delivered_at': self.delivered_at,
            'batch_id': self.batch_id,
        }


def project(customer, start: date, end: date) -> list[DayPlan]:
    if customer.dairy_id is None:
        return [DayPlan(date=start + timedelta(days=i)) for i in range((end - start).days + 1)]

    today = timezone.localdate()
    earliest = earliest_changeable_date(customer.dairy)
    subs = list(customer.subscriptions.filter(status__in=OPEN_STATUSES).select_related('product'))
    sub_ids = [s.id for s in subs]
    overrides = {(o.subscription_id, o.date): o for o in DeliveryOverride.objects.filter(
        subscription_id__in=sub_ids, date__range=(start, end))}
    vacations = list(VacationPeriod.objects.filter(customer=customer, is_active=True,
                                                   start_date__lte=end, end_date__gte=start))
    orders: dict[date, list[Order]] = {}
    for o in Order.objects.filter(customer=customer, delivery_date__range=(start, end)) \
            .exclude(status=Order.Status.CANCELLED).select_related('product'):
        orders.setdefault(o.delivery_date, []).append(o)
    actual: dict[date, list[DailyDelivery]] = {}
    for d in DailyDelivery.objects.filter(subscription__customer=customer, delivery_date__range=(start, min(end, today))) \
            .select_related('subscription__product'):
        actual.setdefault(d.delivery_date, []).append(d)

    plans = []
    for i in range((end - start).days + 1):
        day = start + timedelta(days=i)
        plan = DayPlan(date=day, locked=day < earliest)
        on_vacation = any(v.start_date <= day <= v.end_date for v in vacations)

        if day <= today and day in actual:
            rows = actual[day]
            for r in rows:
                qty = r.delivered_quantity if r.status == DailyDelivery.Status.DELIVERED else r.scheduled_quantity
                p = r.subscription.product
                plan.items.append({**_line(r.subscription, p, qty, override=False), 'delivery_id': str(r.id),
                                   'delivery_status': r.status})
                if r.status == DailyDelivery.Status.DELIVERED:
                    plan.amount += qty * p.price_per_unit
                    if r.proof_photo:
                        plan.proof_photo = r.proof_photo.url
                    if r.delivered_at:
                        plan.delivered_at = timezone.localtime(r.delivered_at).isoformat()
                if r.batch_id:
                    plan.batch_id = str(r.batch_id)
            statuses = {r.status for r in rows}
            if DailyDelivery.Status.DELIVERED in statuses:
                plan.status = 'delivered'
            elif DailyDelivery.Status.PENDING in statuses:
                plan.status = 'scheduled'
            elif DailyDelivery.Status.MISSED in statuses:
                plan.status = 'missed'
            else:
                plan.status = 'vacation' if on_vacation else 'skipped'
        else:
            any_line = False
            for s in subs:
                if s.start_date > day or (s.end_date and s.end_date < day):
                    continue
                any_line = True
                if s.status != Subscription.Status.ACTIVE or on_vacation:
                    qty, is_override = ZERO, False
                elif (s.id, day) in overrides:
                    qty, is_override = overrides[(s.id, day)].quantity, True
                else:
                    qty, is_override = s.default_quantity, False
                plan.items.append(_line(s, s.product, qty, override=is_override))
                plan.amount += qty * s.product.price_per_unit
            if on_vacation and any_line:
                plan.status = 'vacation'
            elif any_line and all(s.status == Subscription.Status.PAUSED for s in subs):
                plan.status = 'paused'
            elif any(it['quantity'] > 0 for it in plan.items):
                plan.status = 'scheduled'
            elif any_line:
                plan.status = 'skipped'

        for o in orders.get(day, []):
            plan.orders.append({
                'id': str(o.id), 'product': product_brief(o.product), 'quantity': o.quantity,
                'amount': o.total_price, 'status': o.status, 'is_express': o.is_express, 'source': o.source,
            })
            if o.status != Order.Status.CANCELLED and not (on_vacation and day > today):
                plan.amount += o.total_price
            if plan.status in ('none', 'skipped') and o.status == Order.Status.PENDING:
                plan.status = 'scheduled'
            elif plan.status == 'none' and o.status == Order.Status.DELIVERED:
                plan.status = 'delivered'

        plan.bottles = sum(math.ceil(it['quantity']) for it in plan.items if it['product']['container'] == 'glass_bottle')
        plans.append(plan)
    return plans


def _line(sub: Subscription, p: Product, qty, override: bool) -> dict:
    return {
        'subscription_id': str(sub.id), 'product': product_brief(p), 'quantity': qty,
        'default_quantity': sub.default_quantity, 'is_override': override,
        'line_amount': (qty * p.price_per_unit).quantize(Decimal('0.01')),
        'subscription_status': sub.status,
    }


def burn_rate(customer, wallet) -> dict:
    """Average daily spend over the next week and the last day the wallet balance covers."""
    tomorrow = timezone.localdate() + timedelta(days=1)
    horizon = project(customer, tomorrow, tomorrow + timedelta(days=59))
    week = horizon[:7]
    daily = (sum((d.amount for d in week), ZERO) / 7).quantize(Decimal('0.01'))

    covers_until, remaining = None, Decimal(wallet.balance)
    for d in horizon:
        if d.amount <= 0:
            if covers_until is not None or remaining > 0:
                covers_until = d.date
            continue
        if remaining < d.amount:
            break
        remaining -= d.amount
        covers_until = d.date
    days_covered = (covers_until - tomorrow).days + 1 if covers_until else 0
    return {
        'daily_average': daily,
        'next_7_days': sum((d.amount for d in week), ZERO).quantize(Decimal('0.01')),
        'covers_until': covers_until.isoformat() if covers_until and wallet.balance > 0 else None,
        'days_covered': days_covered if wallet.balance > 0 else 0,
        'covers_horizon': covers_until == horizon[-1].date if covers_until else False,
    }
