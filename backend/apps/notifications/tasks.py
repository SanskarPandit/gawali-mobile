from celery import shared_task
from django.utils import timezone
import logging
from apps.customers.models import CustomerProfile
from .models import Notification

logger = logging.getLogger(__name__)

@shared_task
def send_cutoff_reminders_task():
    """Daily 9:00 PM cutoff reminder notification to all active customers."""
    logger.info("Dispatching cutoff reminders...")
    customers = CustomerProfile.objects.filter(is_active=True).select_related('user', 'dairy')
    count = 0
    for cust in customers:
        dairy_name = cust.dairy.business_name if cust.dairy else "Your dairy"
        Notification.objects.create(
            user=cust.user,
            title="Reminder: Tomorrow's Milk Delivery 🥛",
            body=f"Planning to skip or add extra milk tomorrow? Make your changes in Gawali before 10:00 PM.",
            notification_type=Notification.NotificationType.CUTOFF_REMINDER,
            data={'dairy': dairy_name}
        )
        count += 1
    logger.info(f"Dispatched {count} cutoff reminders.")
    return {'dispatched': count}
