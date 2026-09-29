import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.local')

app = Celery('gawali')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

# Celery Beat Scheduled Tasks
app.conf.beat_schedule = {
    # Generate daily delivery manifest at 00:05 AM every day
    'generate-daily-deliveries-midnight': {
        'task': 'apps.deliveries.tasks.generate_daily_deliveries_task',
        'schedule': crontab(hour=0, minute=5),
    },
    # Enforce cutoff reminders at 9:00 PM (21:00) every evening
    'send-cutoff-reminder-notifications': {
        'task': 'apps.notifications.tasks.send_cutoff_reminders_task',
        'schedule': crontab(hour=21, minute=0),
    },
    # Auto-generate monthly bills on the 1st of every month at 01:00 AM
    'generate-monthly-billing-cycle': {
        'task': 'apps.billing.tasks.generate_monthly_bills_task',
        'schedule': crontab(hour=1, minute=0, day_of_month=1),
    },
}
