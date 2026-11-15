from decimal import Decimal

from django.conf import settings
from django.db import models

from apps.core.models import BaseModel
from apps.customers.models import CustomerProfile


class Wallet(BaseModel):
    """One wallet per customer. Never locks a deposit: the balance is always withdrawable."""

    class BillingMode(models.TextChoices):
        WALLET = 'wallet', 'Prepaid Wallet'
        AUTOPAY = 'autopay', 'UPI Autopay (post-delivery)'

    class MandateStatus(models.TextChoices):
        INACTIVE = 'inactive', 'Not set up'
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'

    customer = models.OneToOneField(CustomerProfile, on_delete=models.CASCADE, related_name='wallet')
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    billing_mode = models.CharField(max_length=20, choices=BillingMode.choices, default=BillingMode.WALLET)

    auto_topup_enabled = models.BooleanField(default=False)
    auto_topup_threshold = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('100'))
    auto_topup_amount = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('500'))

    autopay_upi_id = models.CharField(max_length=100, blank=True)
    autopay_status = models.CharField(max_length=20, choices=MandateStatus.choices, default=MandateStatus.INACTIVE)
    autopay_max_daily = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal('500'))

    default_withdraw_upi = models.CharField(max_length=100, blank=True)

    class Meta:
        verbose_name = 'Wallet'
        verbose_name_plural = 'Wallets'

    def __str__(self):
        return f"Wallet of {self.customer.user.full_name}: ₹{self.balance}"


class WalletTransaction(BaseModel):
    class Kind(models.TextChoices):
        TOPUP = 'topup', 'UPI Top-up'
        AUTO_TOPUP = 'auto_topup', 'Auto Top-up'
        DELIVERY = 'delivery', 'Delivery Charge'
        ORDER = 'order', 'Add-on Order'
        AUTOPAY = 'autopay', 'UPI Autopay Debit'
        REFUND = 'refund', 'Instant Refund'
        BOTTLE_DEPOSIT = 'bottle_deposit', 'Bottle Deposit'
        BOTTLE_RETURN = 'bottle_return', 'Bottle Deposit Returned'
        ECO_CREDIT = 'eco_credit', 'Pouch Eco-credit'
        WITHDRAWAL = 'withdrawal', 'Withdrawal to Bank / UPI'
        ADJUSTMENT = 'adjustment', 'Adjustment'

    class Direction(models.TextChoices):
        CREDIT = 'credit', 'Credit'
        DEBIT = 'debit', 'Debit'

    class Channel(models.TextChoices):
        WALLET = 'wallet', 'Wallet balance'
        AUTOPAY = 'autopay', 'UPI Autopay mandate'

    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE, related_name='transactions')
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    direction = models.CharField(max_length=10, choices=Direction.choices)
    channel = models.CharField(max_length=10, choices=Channel.choices, default=Channel.WALLET)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=255)
    reference = models.CharField(max_length=100, blank=True, db_index=True, help_text='UTR / delivery / claim id')
    for_date = models.DateField(null=True, blank=True, db_index=True)
    meta = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        sign = '+' if self.direction == self.Direction.CREDIT else '-'
        return f"{sign}₹{self.amount} {self.get_kind_display()} ({self.wallet.customer.user.full_name})"


class PackagingEntry(BaseModel):
    """Circular packaging ledger: glass bottles handed over and collected, pouches returned."""

    class Kind(models.TextChoices):
        BOTTLE_ISSUED = 'bottle_issued', 'Bottle delivered'
        BOTTLE_RETURNED = 'bottle_returned', 'Bottle collected'
        POUCH_RETURNED = 'pouch_returned', 'Pouches collected'

    customer = models.ForeignKey(CustomerProfile, on_delete=models.CASCADE, related_name='packaging_entries')
    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    count = models.PositiveIntegerField()
    date = models.DateField(db_index=True)
    recorded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    note = models.CharField(max_length=255, blank=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.date} {self.customer.user.full_name}: {self.count} × {self.get_kind_display()}"
