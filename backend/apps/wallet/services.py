"""
Money movement for customers. Every change to a balance writes a WalletTransaction in the
same database transaction, so the ledger always explains the balance.

Charges follow the customer's billing mode:
  * wallet  – debited from the prepaid balance (auto top-up first, if enabled and low)
  * autopay – collected through the UPI Autopay mandate; the wallet balance is untouched
Credits (refunds, bottle deposits returned, eco-credits) always land in the wallet,
which the customer can withdraw at any time.
"""
import secrets
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from .models import PackagingEntry, Wallet, WalletTransaction

MIN_TOPUP = Decimal('50')
MAX_TOPUP = Decimal('20000')
POUCHES_PER_ECO_CREDIT = 10


class WalletError(Exception):
    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field

    def as_response_data(self):
        return {self.field: [self.message]} if self.field else {'detail': self.message}


def money(value) -> Decimal:
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def utr() -> str:
    """Simulated UPI transaction reference (12 digits, like a real UTR)."""
    return ''.join(secrets.choice('0123456789') for _ in range(12))


def get_wallet(customer, lock: bool = False) -> Wallet:
    wallet, _ = Wallet.objects.get_or_create(customer=customer)
    if lock:
        wallet = Wallet.objects.select_for_update().get(pk=wallet.pk)
    return wallet


def _write(wallet: Wallet, *, kind, direction, amount, description, reference='', for_date=None,
           channel=WalletTransaction.Channel.WALLET, meta=None) -> WalletTransaction:
    amount = money(amount)
    if channel == WalletTransaction.Channel.WALLET:
        wallet.balance = money(wallet.balance + amount if direction == WalletTransaction.Direction.CREDIT
                               else wallet.balance - amount)
        wallet.save(update_fields=['balance', 'updated_at'])
    return WalletTransaction.objects.create(
        wallet=wallet, kind=kind, direction=direction, channel=channel, amount=amount,
        balance_after=wallet.balance, description=description[:255], reference=reference,
        for_date=for_date, meta=meta or {},
    )


@transaction.atomic
def credit(customer, amount, kind, description, reference='', for_date=None, meta=None) -> WalletTransaction:
    wallet = get_wallet(customer, lock=True)
    return _write(wallet, kind=kind, direction=WalletTransaction.Direction.CREDIT, amount=amount,
                  description=description, reference=reference, for_date=for_date, meta=meta)


@transaction.atomic
def charge(customer, amount, kind, description, reference='', for_date=None, meta=None) -> WalletTransaction | None:
    """Collect money for something delivered. Returns None for a zero amount."""
    amount = money(amount)
    if amount <= 0:
        return None
    wallet = get_wallet(customer, lock=True)
    payments_on = settings.PAYMENTS_ENABLED

    if payments_on and wallet.billing_mode == Wallet.BillingMode.AUTOPAY and wallet.autopay_status == Wallet.MandateStatus.ACTIVE:
        return _write(wallet, kind=WalletTransaction.Kind.AUTOPAY, direction=WalletTransaction.Direction.DEBIT,
                      amount=amount, description=description, reference=reference or utr(), for_date=for_date,
                      channel=WalletTransaction.Channel.AUTOPAY,
                      meta={**(meta or {}), 'mandate': wallet.autopay_upi_id, 'charge_kind': kind})

    if payments_on and wallet.auto_topup_enabled and wallet.balance - amount < wallet.auto_topup_threshold:
        _write(wallet, kind=WalletTransaction.Kind.AUTO_TOPUP, direction=WalletTransaction.Direction.CREDIT,
               amount=wallet.auto_topup_amount, reference=utr(),
               description=f"Auto top-up (balance fell below ₹{wallet.auto_topup_threshold:.0f})",
               meta={'upi': wallet.autopay_upi_id or wallet.default_withdraw_upi})

    # A wallet may dip below zero for a delivery already made: that is the amount due to the dairy.
    return _write(wallet, kind=kind, direction=WalletTransaction.Direction.DEBIT, amount=amount,
                  description=description, reference=reference, for_date=for_date, meta=meta)


@transaction.atomic
def topup(customer, amount, upi_id: str) -> WalletTransaction:
    amount = money(amount)
    if amount < MIN_TOPUP or amount > MAX_TOPUP:
        raise WalletError(f'Top-up must be between ₹{MIN_TOPUP:.0f} and ₹{MAX_TOPUP:.0f}.', 'amount')
    if not upi_id or '@' not in upi_id:
        raise WalletError('Enter a valid UPI ID, e.g. name@okhdfc.', 'upi_id')
    wallet = get_wallet(customer, lock=True)
    return _write(wallet, kind=WalletTransaction.Kind.TOPUP, direction=WalletTransaction.Direction.CREDIT,
                  amount=amount, description=f'Added via UPI ({upi_id})', reference=utr(), meta={'upi': upi_id})


@transaction.atomic
def withdraw(customer, amount, destination: str) -> WalletTransaction:
    wallet = get_wallet(customer, lock=True)
    amount = money(amount if amount is not None else wallet.balance)
    if amount <= 0:
        raise WalletError('There is no balance to withdraw.', 'amount')
    if amount > wallet.balance:
        raise WalletError(f'You can withdraw up to ₹{wallet.balance}.', 'amount')
    destination = (destination or '').strip()
    if len(destination) < 5:
        raise WalletError('Enter a UPI ID or bank account to receive the money.', 'destination')
    wallet.default_withdraw_upi = destination
    wallet.save(update_fields=['default_withdraw_upi', 'updated_at'])
    return _write(wallet, kind=WalletTransaction.Kind.WITHDRAWAL, direction=WalletTransaction.Direction.DEBIT,
                  amount=amount, description=f'Withdrawn to {destination}', reference=utr(),
                  meta={'destination': destination, 'settled_at': timezone.now().isoformat()})


def require_payments():
    if not settings.PAYMENTS_ENABLED:
        raise WalletError('Online payments are switched off for now. Please settle with your dairy directly.')


@transaction.atomic
def record_offline_payment(customer, amount, method: str, recorded_by) -> WalletTransaction:
    """A dairy logs cash or UPI it collected directly; this is how dues are cleared while the gateway is off."""
    amount = money(amount)
    if amount <= 0 or amount > MAX_TOPUP:
        raise WalletError(f'Enter an amount between ₹1 and ₹{MAX_TOPUP:.0f}.', 'amount')
    method = (method or 'cash').strip().lower()[:20]
    wallet = get_wallet(customer, lock=True)
    return _write(wallet, kind=WalletTransaction.Kind.ADJUSTMENT, direction=WalletTransaction.Direction.CREDIT,
                  amount=amount, description=f'Payment received by dairy ({method})',
                  meta={'method': method, 'recorded_by': str(recorded_by.pk)})


# --- Circular packaging ----------------------------------------------------------------

def bottles_with_customer(customer) -> int:
    totals = dict(
        PackagingEntry.objects.filter(customer=customer, kind__in=[
            PackagingEntry.Kind.BOTTLE_ISSUED, PackagingEntry.Kind.BOTTLE_RETURNED,
        ]).values_list('kind').annotate(n=Sum('count'))
    )
    return max(0, (totals.get(PackagingEntry.Kind.BOTTLE_ISSUED) or 0) - (totals.get(PackagingEntry.Kind.BOTTLE_RETURNED) or 0))


def pouches_returned(customer) -> int:
    return PackagingEntry.objects.filter(customer=customer, kind=PackagingEntry.Kind.POUCH_RETURNED) \
        .aggregate(n=Sum('count'))['n'] or 0


@transaction.atomic
def record_packaging(customer, *, on_date: date, bottles_issued=0, bottles_returned=0, pouches=0, user=None) -> dict:
    """Log a doorstep hand-over. Returned bottles refund their deposit; every 10 pouches earn an eco-credit."""
    dairy = customer.dairy
    deposit = Decimal(dairy.bottle_deposit if dairy else 10)
    result = {'deposit_charged': Decimal('0'), 'deposit_returned': Decimal('0'), 'eco_credit': Decimal('0')}

    # The deposit follows the bottles at home, so a like-for-like swap (2 full in, 2 empty out) moves no money;
    # only a net change charges or refunds ₹deposit per bottle.
    bottles_returned = min(int(bottles_returned or 0), bottles_with_customer(customer))
    if bottles_issued:
        PackagingEntry.objects.create(customer=customer, kind=PackagingEntry.Kind.BOTTLE_ISSUED,
                                      count=bottles_issued, date=on_date, recorded_by=user)
    if bottles_returned:
        PackagingEntry.objects.create(customer=customer, kind=PackagingEntry.Kind.BOTTLE_RETURNED,
                                      count=bottles_returned, date=on_date, recorded_by=user)
    net = int(bottles_issued) - bottles_returned
    if net > 0:
        result['deposit_charged'] = deposit * net
        charge(customer, result['deposit_charged'], WalletTransaction.Kind.BOTTLE_DEPOSIT,
               f'Refundable deposit · {net} more glass bottle{"s" if net > 1 else ""} at home', for_date=on_date)
    elif net < 0:
        result['deposit_returned'] = deposit * -net
        credit(customer, result['deposit_returned'], WalletTransaction.Kind.BOTTLE_RETURN,
               f'{-net} bottle{"s" if net < -1 else ""} returned · ₹{deposit:.0f} each', for_date=on_date)
    result['bottles_returned'] = bottles_returned
    if pouches:
        before = pouches_returned(customer) // POUCHES_PER_ECO_CREDIT
        PackagingEntry.objects.create(customer=customer, kind=PackagingEntry.Kind.POUCH_RETURNED,
                                      count=pouches, date=on_date, recorded_by=user)
        earned = pouches_returned(customer) // POUCHES_PER_ECO_CREDIT - before
        if earned > 0:
            per = Decimal(dairy.pouch_eco_credit if dairy else 5)
            result['eco_credit'] = per * earned
            credit(customer, result['eco_credit'], WalletTransaction.Kind.ECO_CREDIT,
                   f'Eco-credit · {earned * POUCHES_PER_ECO_CREDIT} clean pouches recycled', for_date=on_date)
    return result
