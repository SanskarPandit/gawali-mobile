from datetime import date
from decimal import Decimal

from django.db import transaction

from apps.core.scheduling import earliest_changeable_date, refresh_manifests
from apps.products.models import Product
from .models import Subscription

OPEN_STATUSES = (Subscription.Status.ACTIVE, Subscription.Status.PAUSED)


class PlanError(Exception):
    def __init__(self, message: str, field: str | None = None):
        super().__init__(message)
        self.message = message
        self.field = field

    def as_response_data(self):
        return {self.field: [self.message]} if self.field else {'detail': self.message}


def current_plan(customer) -> Subscription | None:
    """A customer has at most one open (active or paused) daily plan."""
    return customer.subscriptions.filter(status__in=OPEN_STATUSES).select_related('product').first()


def subscribable_product(dairy, product_id) -> Product:
    product = Product.objects.filter(
        id=product_id, dairy=dairy, kind=Product.Kind.SUBSCRIPTION, is_available=True
    ).first()
    if product is None:
        raise PlanError('Choose a daily product from this dairy.', 'product_id')
    return product


@transaction.atomic
def set_plan(customer, *, product: Product | None = None, quantity: Decimal | None = None,
             time_slot: str | None = None, status: str | None = None,
             start_date: date | None = None) -> Subscription:
    """Create the customer's daily plan, or change the existing one. Changes apply from the next changeable day."""
    if customer.dairy_id is None:
        raise PlanError('This customer is not linked to a dairy yet.')

    plan = current_plan(customer)
    earliest = earliest_changeable_date(customer.dairy)

    if plan is None:
        if product is None or quantity is None:
            raise PlanError('A product and quantity are required to start a plan.')
        if start_date and start_date < earliest:
            raise PlanError(f"The plan can start on {earliest.strftime('%d %b')} at the earliest.", 'start_date')
        plan = Subscription.objects.create(
            customer=customer,
            product=product,
            default_quantity=quantity,
            delivery_time_slot=time_slot or Subscription.TimeSlot.MORNING,
            status=status or Subscription.Status.ACTIVE,
            start_date=start_date or earliest,
        )
    else:
        if product is not None:
            plan.product = product
        if quantity is not None:
            plan.default_quantity = quantity
        if time_slot is not None:
            plan.delivery_time_slot = time_slot
        if status is not None:
            plan.status = status
            if status == Subscription.Status.CANCELLED:
                plan.end_date = earliest
        plan.save()

    if plan.status != Subscription.Status.ACTIVE:
        # A paused/cancelled plan must not leave untouched future stops on a gawali's route.
        from apps.deliveries.models import DailyDelivery

        DailyDelivery.objects.filter(
            subscription=plan,
            delivery_date__gte=earliest,
            status=DailyDelivery.Status.PENDING,
            status_updated_at__isnull=True,
        ).update(status=DailyDelivery.Status.SKIPPED, scheduled_quantity=Decimal('0'))

    refresh_manifests(customer.dairy, [earliest])
    return plan
