from django.utils import timezone
from datetime import timedelta, date
from celery import shared_task
import logging

logger = logging.getLogger(__name__)

def generate_daily_deliveries_for_date(target_date=None):
    from apps.subscriptions.models import Subscription, DeliveryOverride, VacationPeriod
    from apps.deliveries.models import DailyDelivery

    if target_date is None:
        target_date = timezone.localdate()

    logger.info(f"Generating daily deliveries for date: {target_date}")
    active_subscriptions = Subscription.objects.filter(
        status='active',
        start_date__lte=target_date
    ).select_related('customer', 'product', 'customer__delivery_route')

    created_count = 0
    updated_count = 0

    for sub in active_subscriptions:
        customer = sub.customer
        if not customer.is_active:
            continue

        # 1. Check vacation
        in_vacation = VacationPeriod.objects.filter(
            customer=customer,
            is_active=True,
            start_date__lte=target_date,
            end_date__gte=target_date
        ).exists()

        # 2. Check override
        override = DeliveryOverride.objects.filter(
            subscription=sub,
            date=target_date
        ).first()

        if in_vacation:
            scheduled_qty = 0.0
            initial_status = DailyDelivery.Status.SKIPPED
        elif override:
            scheduled_qty = float(override.quantity)
            initial_status = DailyDelivery.Status.SKIPPED if scheduled_qty == 0 else DailyDelivery.Status.PENDING
        else:
            scheduled_qty = float(sub.default_quantity)
            initial_status = DailyDelivery.Status.PENDING

        delivery_boy = None
        if customer.delivery_route:
            delivery_boy = customer.delivery_route.delivery_boys.filter(is_active=True).first()

        deliv, created = DailyDelivery.objects.update_or_create(
            subscription=sub,
            delivery_date=target_date,
            defaults={
                'scheduled_quantity': scheduled_qty,
                'delivered_quantity': scheduled_qty if initial_status == DailyDelivery.Status.PENDING else 0.0,
                'status': initial_status,
                'delivery_boy': delivery_boy
            }
        )

        if created:
            created_count += 1
        else:
            updated_count += 1

    logger.info(f"Daily deliveries finished: {created_count} created, {updated_count} updated.")
    return {'created': created_count, 'updated': updated_count}

@shared_task
def generate_daily_deliveries_task():
    """Celery scheduled task running at 00:05 AM."""
    return generate_daily_deliveries_for_date(timezone.localdate())
