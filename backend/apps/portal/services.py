import hashlib
from concurrent.futures import ThreadPoolExecutor
import hmac
import math
import time
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone

from apps.assistant.services import label_refund_decision, verify_refund_photo
from apps.core.scheduling import cutoff_message, earliest_changeable_date, refresh_manifests
from apps.deliveries.models import DailyDelivery
from apps.deliveries.services import DeliveryUpdate, apply_delivery_update, generate_daily_deliveries
from apps.notifications.models import Notification
from apps.products.models import Product
from apps.quality.models import MilkBatch
from apps.refunds.models import RefundClaim
from apps.subscriptions.models import DeliveryOverride, Order, Subscription, VacationPeriod
from apps.wallet import services as wallet_services
from apps.wallet.models import WalletTransaction
from apps.ops.billing import ensure_within_limit

MAX_QTY = Decimal('20')


class PortalError(Exception):
    def __init__(self, message: str, field: str | None = None, status: int = 400):
        super().__init__(message)
        self.message = message
        self.field = field
        self.status = status

    def as_response_data(self):
        data = {'detail': self.message}
        if self.field:
            data[self.field] = [self.message]
        return data


def notify(user, title, body, kind=Notification.NotificationType.GENERAL, **data):
    Notification.objects.create(user=user, title=title, body=body, notification_type=kind, data=data)


# --- Society gate ------------------------------------------------------------------------

def gate_token(customer, on_date: date) -> str:
    """Six-character entry token for society security, valid only for one morning's slot."""
    digest = hmac.new(settings.SECRET_KEY.encode(), f'{customer.id}:{on_date.isoformat()}'.encode(), hashlib.sha256)
    alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    n = int(digest.hexdigest(), 16)
    return ''.join(alphabet[(n >> (5 * i)) & 31] for i in range(6))


# --- Customer day edits ------------------------------------------------------------------

def ensure_editable(customer, day: date):
    if customer.dairy_id is None:
        raise PortalError('Choose a dairy first.')
    if day < earliest_changeable_date(customer.dairy):
        raise PortalError(cutoff_message(customer.dairy), 'date')
    if day > timezone.localdate() + timedelta(days=90):
        raise PortalError('You can plan up to 90 days ahead.', 'date')


def _open_sub(customer, sub_id) -> Subscription:
    sub = customer.subscriptions.filter(id=sub_id, status__in=(Subscription.Status.ACTIVE, Subscription.Status.PAUSED)) \
        .select_related('product').first()
    if sub is None:
        raise PortalError('This subscription was not found.', 'subscription_id', 404)
    return sub


@transaction.atomic
def set_day_quantity(customer, day: date, sub_id, quantity: Decimal) -> None:
    ensure_editable(customer, day)
    sub = _open_sub(customer, sub_id)
    quantity = Decimal(quantity).quantize(Decimal('0.01'))
    if quantity < 0 or quantity > MAX_QTY:
        raise PortalError(f'Quantity must be between 0 and {MAX_QTY:g}.', 'quantity')
    if quantity == sub.default_quantity:
        DeliveryOverride.all_objects.filter(subscription=sub, date=day).delete()
    else:
        kind = (DeliveryOverride.OverrideType.SKIP if quantity == 0 else
                DeliveryOverride.OverrideType.DOUBLE if quantity == sub.default_quantity * 2 else
                DeliveryOverride.OverrideType.CUSTOM)
        DeliveryOverride.all_objects.update_or_create(
            subscription=sub, date=day,
            defaults={'quantity': quantity, 'override_type': kind, 'is_deleted': False, 'deleted_at': None},
        )
    refresh_manifests(customer.dairy, [day])


@transaction.atomic
def set_day_skipped(customer, day: date, skip: bool) -> None:
    ensure_editable(customer, day)
    subs = customer.subscriptions.filter(status=Subscription.Status.ACTIVE, start_date__lte=day)
    for sub in subs:
        if skip:
            DeliveryOverride.all_objects.update_or_create(
                subscription=sub, date=day,
                defaults={'quantity': Decimal('0'), 'override_type': DeliveryOverride.OverrideType.SKIP,
                          'reason': 'Skipped from calendar', 'is_deleted': False, 'deleted_at': None},
            )
        else:
            DeliveryOverride.all_objects.filter(subscription=sub, date=day).delete()
    if skip:
        Order.objects.filter(customer=customer, delivery_date=day, status=Order.Status.PENDING, is_express=False) \
            .update(status=Order.Status.CANCELLED)
    refresh_manifests(customer.dairy, [day])


def _available_product(customer, product_id) -> Product:
    p = Product.objects.filter(id=product_id, dairy=customer.dairy, is_available=True).first()
    if p is None:
        raise PortalError('This product is not available from your dairy.', 'product_id', 404)
    return p


@transaction.atomic
def add_order(customer, product_id, quantity, day: date, source='shop', express=False) -> Order:
    if express:
        day = timezone.localdate()
    else:
        ensure_editable(customer, day)
    product = _available_product(customer, product_id)
    quantity = Decimal(quantity).quantize(Decimal('0.01'))
    if quantity <= 0 or quantity > MAX_QTY:
        raise PortalError(f'Quantity must be between 0.5 and {MAX_QTY:g}.', 'quantity')
    ensure_within_limit(customer, quantity * product.price_per_unit)
    existing = Order.objects.filter(customer=customer, product=product, delivery_date=day,
                                    status=Order.Status.PENDING, is_express=express).first()
    if existing:
        existing.quantity += quantity
        existing.total_price = (existing.quantity * existing.unit_price).quantize(Decimal('0.01'))
        existing.save(update_fields=['quantity', 'total_price', 'updated_at'])
        return existing
    return Order.objects.create(
        customer=customer, dairy=customer.dairy, product=product, quantity=quantity,
        unit_price=product.price_per_unit, total_price=(quantity * product.price_per_unit).quantize(Decimal('0.01')),
        delivery_date=day, source=source, is_express=express,
    )


@transaction.atomic
def swap_variant(customer, day: date, sub_id, product_id) -> Order:
    """Swap one day's milk to another variant: skip the plan line and order the new variant instead."""
    sub = _open_sub(customer, sub_id)
    product = _available_product(customer, product_id)
    if product.id == sub.product_id:
        raise PortalError('That is already your milk for this day.', 'product_id')
    qty = sub.default_quantity
    override = DeliveryOverride.objects.filter(subscription=sub, date=day).first()
    if override and override.quantity > 0:
        qty = override.quantity
    set_day_quantity(customer, day, sub_id, Decimal('0'))
    return add_order(customer, product.id, qty, day, source='calendar')


def vacation_preview(customer, start: date, end: date) -> dict:
    from .schedule import project

    if end < start:
        raise PortalError('The return date must be after the start date.', 'end_date')
    if (end - start).days > 60:
        raise PortalError('A vacation can be at most 60 days long.', 'end_date')
    ensure_editable(customer, start)
    days = project(customer, start, end)
    savings = sum((d.amount for d in days if d.status not in ('vacation', 'skipped', 'paused')), Decimal('0'))
    resume = end + timedelta(days=1)
    dairy = customer.dairy
    return {
        'start_date': start.isoformat(), 'end_date': end.isoformat(), 'days': (end - start).days + 1,
        'savings': savings.quantize(Decimal('0.01')), 'resume_date': resume.isoformat(),
        'resume_time': dairy.slot_start.strftime('%I:%M %p').lstrip('0'),
        'message': (f"You will save ₹{savings:,.0f} while away. Deliveries automatically resume on "
                    f"{resume.strftime('%A, %b')} {resume.day}{_ordinal(resume.day)} at {dairy.slot_start.strftime('%I:%M %p').lstrip('0')}."),
    }


def _ordinal(n: int) -> str:
    return 'th' if 11 <= n % 100 <= 13 else {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10, 'th')


@transaction.atomic
def create_vacation(customer, start: date, end: date, reason='') -> VacationPeriod:
    preview = vacation_preview(customer, start, end)
    overlapping = VacationPeriod.objects.filter(customer=customer, is_active=True, start_date__lte=end, end_date__gte=start)
    if overlapping.exists():
        raise PortalError('This overlaps a vacation you already planned. Edit that one instead.', 'start_date')
    v = VacationPeriod.objects.create(customer=customer, start_date=start, end_date=end, reason=reason[:255])
    Order.objects.filter(customer=customer, delivery_date__range=(start, end), status=Order.Status.PENDING) \
        .update(status=Order.Status.CANCELLED)
    refresh_manifests(customer.dairy, [start + timedelta(days=i) for i in range(preview['days'])])
    return v


# --- Delivery partner: completing a stop -----------------------------------------------------

def stop_rows(customer, day: date):
    return DailyDelivery.objects.filter(subscription__customer=customer, delivery_date=day) \
        .select_related('subscription__product').order_by('subscription__created_at')


@transaction.atomic
def complete_stop(customer, day: date, user, *, outcome: str, bottles_returned=0, pouches=0,
                  photo=None, note='') -> dict:
    """Mark every line of a household's drop (plan lines and add-on orders) and settle the money."""
    if day != timezone.localdate():
        raise PortalError('Only today\'s stops can be completed.', 'date')
    generate_daily_deliveries(day, dairy=customer.dairy)
    rows = [r for r in stop_rows(customer, day).select_for_update()
            if r.status in (DailyDelivery.Status.PENDING, DailyDelivery.Status.MISSED)]
    orders = list(Order.objects.select_for_update().filter(customer=customer, delivery_date=day,
                                                          status=Order.Status.PENDING).select_related('product'))
    if not rows and not orders:
        raise PortalError('Nothing is pending at this stop.', status=409)

    now = timezone.now()
    charged = Decimal('0')
    if outcome == 'missed':
        for r in rows:
            apply_delivery_update(r, user, DeliveryUpdate(status=DailyDelivery.Status.MISSED, notes=note or None))
        notify(customer.user, 'We missed your doorstep today',
               'Your partner could not complete today\'s drop. You were not charged. Reply from the app if you still need milk.',
               Notification.NotificationType.DELIVERY_CONFIRMATION, date=day.isoformat())
        return {'outcome': 'missed', 'charged': charged}

    if outcome != 'delivered':
        raise PortalError('Outcome must be delivered or missed.', 'outcome')
    if customer.photo_proof and photo is None:
        raise PortalError('This household asked for a drop-off photo. Please take one.', 'photo')

    saved_photo = None
    bottles_issued = 0
    for r in rows:
        if r.scheduled_quantity <= 0:
            continue
        r, _ = apply_delivery_update(r, user, DeliveryUpdate(status=DailyDelivery.Status.DELIVERED, notes=note or None))
        if photo is not None:
            if saved_photo is None:
                r.proof_photo.save(f'{customer.id}-{day:%Y%m%d}.jpg', photo, save=False)
                saved_photo = r.proof_photo.name
            else:
                r.proof_photo.name = saved_photo
        p = r.subscription.product
        amount = r.delivered_quantity * p.price_per_unit
        if not r.is_settled:
            wallet_services.charge(customer, amount, WalletTransaction.Kind.DELIVERY,
                                   f'{p.name} · {r.delivered_quantity:g} {p.unit}', reference=str(r.id), for_date=day)
            charged += amount
            r.is_settled = True
        if p.container == Product.Container.GLASS_BOTTLE:
            bottles_issued += math.ceil(r.delivered_quantity)
        r.save(update_fields=['proof_photo', 'is_settled', 'updated_at'])

    for o in orders:
        o.status = Order.Status.DELIVERED
        o.delivered_at = now
        if not o.is_settled:
            wallet_services.charge(customer, o.total_price, WalletTransaction.Kind.ORDER,
                                   f"{'Express · ' if o.is_express else ''}{o.product.name} · {o.quantity:g} {o.product.unit}",
                                   reference=str(o.id), for_date=day)
            charged += o.total_price
            o.is_settled = True
        o.save(update_fields=['status', 'delivered_at', 'is_settled', 'updated_at'])
        if o.product.container == Product.Container.GLASS_BOTTLE:
            bottles_issued += math.ceil(o.quantity)

    packaging = wallet_services.record_packaging(customer, on_date=day, bottles_issued=bottles_issued,
                                                 bottles_returned=int(bottles_returned or 0), pouches=int(pouches or 0),
                                                 user=user)
    photo_url = f'{settings.MEDIA_URL}{saved_photo}' if saved_photo else None
    local = timezone.localtime(now)
    body = f"Dropped at {local.strftime('%I:%M %p').lstrip('0')} by {user.full_name}. ₹{charged:,.2f} settled."
    if packaging['deposit_returned']:
        body += f" ₹{packaging['deposit_returned']:.0f} bottle deposit returned."
    notify(customer.user, 'Your milk has arrived', body, Notification.NotificationType.DELIVERY_CONFIRMATION,
           date=day.isoformat(), photo=photo_url)
    return {'outcome': 'delivered', 'charged': charged, 'photo': photo_url, **packaging}


# --- Instant refunds ----------------------------------------------------------------------

REFUND_WINDOW_DAYS = 1
_UPLOADS = ThreadPoolExecutor(max_workers=8, thread_name_prefix='refund-upload')
MAX_AUTO_REFUNDS_PER_30_DAYS = 3


@transaction.atomic
def file_refund(customer, delivery_id, issue: str, photo) -> RefundClaim:
    started = time.monotonic()
    if issue not in RefundClaim.Issue.values:
        raise PortalError('Choose what went wrong.', 'issue')
    delivery = DailyDelivery.objects.filter(id=delivery_id, subscription__customer=customer) \
        .select_related('subscription__product').first()
    if delivery is None:
        raise PortalError('Delivery not found.', 'delivery_id', 404)
    if delivery.status != DailyDelivery.Status.DELIVERED:
        raise PortalError('Only delivered milk can be reported.', 'delivery_id')
    if delivery.delivery_date < timezone.localdate() - timedelta(days=REFUND_WINDOW_DAYS):
        raise PortalError('Issues must be reported within 24 hours of delivery.', 'delivery_id')
    if delivery.refund_claims.exclude(status=RefundClaim.Status.REJECTED).exists():
        raise PortalError('This delivery already has a claim.', 'delivery_id', 409)
    if photo is None:
        raise PortalError('Add a photo of the issue.', 'photo')

    data = photo.read()
    photo.seek(0)
    # Upload the evidence while the vision model looks at it: the two network calls overlap.
    # (Only for remote object storage; database storage must write inside this transaction.)
    field = RefundClaim._meta.get_field('photo')
    upload = (_UPLOADS.submit(field.storage.save, field.generate_filename(None, f'{delivery.id}.jpg'), ContentFile(data))
              if hasattr(field.storage, 'presigned_url') else None)
    verdict = verify_refund_photo(data, getattr(photo, 'content_type', 'image/jpeg'), issue, str(delivery.id))
    product = delivery.subscription.product
    amount = (delivery.delivered_quantity * product.price_per_unit).quantize(Decimal('0.01'))
    status = RefundClaim.Status.CREDITED if verdict['verdict'] == 'verified' else RefundClaim.Status.UNDER_REVIEW
    recent = RefundClaim.objects.filter(customer=customer, status=RefundClaim.Status.CREDITED,
                                        created_at__gte=timezone.now() - timedelta(days=30)).count()
    if status == RefundClaim.Status.CREDITED and recent >= MAX_AUTO_REFUNDS_PER_30_DAYS:
        status = RefundClaim.Status.UNDER_REVIEW
        verdict['observation'] = (verdict['observation'] + ' Sent for review: several refunds this month.').strip()

    claim = RefundClaim(
        customer=customer, delivery=delivery, issue=issue, amount=amount, status=status,
        ai_verdict=verdict['verdict'], ai_confidence=Decimal(str(round(verdict['confidence'], 2))),
        ai_observation=verdict['observation'], ai_engine=verdict['engine'],
    )
    if upload is not None:
        claim.photo.name = upload.result(timeout=30)
    else:
        claim.photo.save(f'{delivery.id}.jpg', ContentFile(data), save=False)
    if status == RefundClaim.Status.CREDITED:
        wallet_services.credit(customer, amount, WalletTransaction.Kind.REFUND,
                               f'Instant refund · {product.name} ({claim.get_issue_display()})',
                               reference=str(delivery.id), for_date=delivery.delivery_date)
        claim.credited_at = timezone.now()
    claim.processing_ms = int((time.monotonic() - started) * 1000)
    claim.save()

    if status == RefundClaim.Status.UNDER_REVIEW:
        notify(customer.dairy.user, 'Refund claim needs review',
               f'{customer.user.full_name}: {claim.get_issue_display()} · ₹{amount}', claim_id=str(claim.id))
    return claim


@transaction.atomic
def review_refund(claim: RefundClaim, approve: bool, note: str = '') -> RefundClaim:
    if claim.status != RefundClaim.Status.UNDER_REVIEW:
        raise PortalError('This claim has already been decided.', status=409)
    claim.reviewed_note = note[:255]
    label_refund_decision(str(claim.delivery_id), approve, note)
    if approve:
        product = claim.delivery.subscription.product
        wallet_services.credit(claim.customer, claim.amount, WalletTransaction.Kind.REFUND,
                               f'Refund approved · {product.name} ({claim.get_issue_display()})',
                               reference=str(claim.delivery_id), for_date=claim.delivery.delivery_date)
        claim.status = RefundClaim.Status.CREDITED
        claim.credited_at = timezone.now()
        notify(claim.customer.user, 'Refund approved', f'₹{claim.amount} has been added to your wallet.',
               Notification.NotificationType.COMPLAINT_UPDATE, claim_id=str(claim.id))
    else:
        claim.status = RefundClaim.Status.REJECTED
        notify(claim.customer.user, 'Refund claim declined',
               note or 'The dairy could not verify the issue from the photo.',
               Notification.NotificationType.COMPLAINT_UPDATE, claim_id=str(claim.id))
    claim.save()
    return claim


# --- Batches ---------------------------------------------------------------------------

def batch_for_delivery(delivery: DailyDelivery) -> MilkBatch | None:
    if delivery.batch_id:
        return delivery.batch
    dairy = delivery.subscription.customer.dairy
    animal = delivery.subscription.product.animal
    qs = MilkBatch.objects.filter(dairy=dairy, status=MilkBatch.Status.PASSED, delivery_date__lte=delivery.delivery_date)
    return qs.filter(animal=animal).order_by('-delivery_date').first() or qs.order_by('-delivery_date').first()


def assign_batch(batch: MilkBatch) -> int:
    """Link a certified batch to the matching milk deliveries of its morning."""
    if batch.status != MilkBatch.Status.PASSED:
        return 0
    return DailyDelivery.objects.filter(
        subscription__customer__dairy=batch.dairy, delivery_date=batch.delivery_date,
        subscription__product__category=Product.Category.MILK, subscription__product__animal=batch.animal,
    ).update(batch=batch)
