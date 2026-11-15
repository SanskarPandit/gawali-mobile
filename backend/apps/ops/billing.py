"""
Dues and credit limits. Payments are collected by the dairy directly, so the ledger balance is the
truth: negative means the household owes that amount. Each dairy sets a credit limit; past it,
add-ons are refused and (if the dairy chooses) next-day deliveries are held until a payment clears it.
"""
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.notifications.models import Notification
from apps.subscriptions.models import DeliveryOverride, Order, Subscription

HOLD_REASON = 'Payment due — held by credit limit'
ZERO = Decimal('0')


def dues_status(customer, wallet=None) -> dict:
    from apps.wallet.services import get_wallet

    wallet = wallet or get_wallet(customer)
    dairy = customer.dairy
    limit = Decimal(dairy.credit_limit) if dairy else Decimal('1500')
    due = max(ZERO, -Decimal(wallet.balance))
    return {
        'due': due,
        'credit_limit': limit,
        'available_credit': max(ZERO, limit - due),
        'over_limit': due >= limit > 0,
        'near_limit': limit > 0 and due >= limit * Decimal('0.8') and due < limit,
        'hold_enabled': bool(dairy and dairy.hold_on_dues),
    }


class CreditLimitError(Exception):
    status = 402

    def __init__(self, message):
        super().__init__(message)
        self.message = message

    def as_response_data(self):
        return {'detail': self.message, 'code': 'credit_limit'}


def ensure_within_limit(customer, extra: Decimal = ZERO):
    s = dues_status(customer)
    if s['credit_limit'] > 0 and s['due'] + Decimal(extra) > s['credit_limit']:
        raise CreditLimitError(
            f"₹{s['due']:,.0f} is due to {customer.dairy.business_name}, which is at the ₹{s['credit_limit']:,.0f} limit. "
            'Please settle with your dairy to add more items.'
        )


@transaction.atomic
def hold_deliveries(customer, day) -> bool:
    """Skip one day for a household over its limit. Idempotent; returns True if a hold was placed."""
    subs = list(customer.subscriptions.filter(status=Subscription.Status.ACTIVE, start_date__lte=day))
    placed = False
    for sub in subs:
        existing = DeliveryOverride.all_objects.filter(subscription=sub, date=day).first()
        if existing and not existing.is_deleted and existing.quantity == 0:
            continue
        DeliveryOverride.all_objects.update_or_create(
            subscription=sub, date=day,
            defaults={'quantity': ZERO, 'override_type': DeliveryOverride.OverrideType.SKIP, 'reason': HOLD_REASON,
                      'is_deleted': False, 'deleted_at': None},
        )
        placed = True
    Order.objects.filter(customer=customer, delivery_date=day, status=Order.Status.PENDING, is_express=False) \
        .update(status=Order.Status.CANCELLED)
    return placed


@transaction.atomic
def release_holds(customer) -> int:
    """Remove credit holds on days that can still change, once dues are back under the limit."""
    from apps.core.scheduling import earliest_changeable_date, refresh_manifests

    if dues_status(customer)['over_limit'] or customer.dairy is None:
        return 0
    earliest = earliest_changeable_date(customer.dairy)
    qs = DeliveryOverride.all_objects.filter(subscription__customer=customer, reason=HOLD_REASON, date__gte=earliest)
    days = sorted(set(qs.values_list('date', flat=True)))
    n = qs.count()
    qs.delete()
    if days:
        refresh_manifests(customer.dairy, days)
    return n


def enforce_credit_holds(dairy, day) -> dict:
    """Run at cutoff: hold `day` for every household of this dairy that is over its limit."""
    from apps.customers.models import CustomerProfile
    from apps.wallet.models import Wallet

    if not dairy.hold_on_dues or dairy.credit_limit <= 0:
        return {'held': 0}
    held = 0
    for w in Wallet.objects.filter(customer__dairy=dairy, customer__is_active=True, balance__lte=-dairy.credit_limit) \
            .select_related('customer__user', 'customer__dairy'):
        c: CustomerProfile = w.customer
        if hold_deliveries(c, day):
            held += 1
            due = -w.balance
            Notification.objects.create(
                user=c.user, title='Delivery on hold: payment due',
                body=f"₹{due:,.0f} is due to {dairy.business_name}. Tomorrow's delivery is paused until you settle with them.",
                notification_type=Notification.NotificationType.BILL_GENERATED, data={'date': day.isoformat()})
    if held:
        Notification.objects.create(
            user=dairy.user, title=f'{held} deliveries held for dues',
            body=f"{held} households are over your ₹{dairy.credit_limit:,.0f} credit limit; their {day.strftime('%d %b')} delivery is paused.",
            notification_type=Notification.NotificationType.GENERAL)
    return {'held': held}


def dues_report(dairy) -> list[dict]:
    """Households that owe money, worst first, with days since their last payment."""
    from apps.wallet.models import Wallet, WalletTransaction

    rows = []
    wallets = Wallet.objects.filter(customer__dairy=dairy, balance__lt=0).select_related('customer__user', 'customer__delivery_route')
    last_paid = dict(
        WalletTransaction.objects.filter(wallet__in=wallets, direction='credit', kind__in=('adjustment', 'topup'))
        .values_list('wallet_id').order_by().annotate(last=Max('created_at'))
    )
    today = timezone.localdate()
    for w in wallets.order_by('balance'):
        lp = last_paid.get(w.id)
        rows.append({
            'customer_id': str(w.customer_id), 'name': w.customer.user.full_name, 'phone': w.customer.user.phone,
            'route_name': w.customer.delivery_route.name if w.customer.delivery_route else None,
            'due': -w.balance, 'over_limit': -w.balance >= dairy.credit_limit > 0,
            'last_payment': timezone.localtime(lp).date().isoformat() if lp else None,
            'days_since_payment': (today - timezone.localtime(lp).date()).days if lp else None,
        })
    return rows
