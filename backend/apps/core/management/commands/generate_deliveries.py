from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime
from apps.deliveries.tasks import generate_daily_deliveries_for_date

class Command(BaseCommand):
    help = 'Generates daily delivery records for all active subscriptions for a target date.'

    def add_arguments(self, parser):
        parser.add_argument('--date', type=str, help='Target delivery date in YYYY-MM-DD format (defaults to tomorrow).')

    def handle(self, *args, **options):
        date_str = options.get('date')
        if date_str:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        else:
            target_date = timezone.localdate()

        self.stdout.write(f"Generating deliveries for date: {target_date}")
        result = generate_daily_deliveries_for_date(target_date)
        self.stdout.write(self.style.SUCCESS(f"Complete: {result['created']} created, {result['updated']} updated."))
