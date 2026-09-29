from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import datetime, date
from apps.customers.models import CustomerProfile
from apps.billing.tasks import generate_bill_for_customer_month

class Command(BaseCommand):
    help = 'Generates monthly bills for all active customers for a specified month.'

    def add_arguments(self, parser):
        parser.add_argument('--month', type=str, help='Billing month in YYYY-MM format (defaults to current month).')

    def handle(self, *args, **options):
        month_str = options.get('month')
        if month_str:
            month_date = datetime.strptime(month_str, '%Y-%m').date().replace(day=1)
        else:
            month_date = timezone.localdate().replace(day=1)

        self.stdout.write(f"Generating monthly bills for {month_date.strftime('%B %Y')}...")
        customers = CustomerProfile.objects.filter(is_active=True).select_related('dairy', 'user')

        count = 0
        for cust in customers:
            bill = generate_bill_for_customer_month(cust, month_date)
            if bill:
                count += 1
                self.stdout.write(f"  -> Bill #{bill.id} for {cust.user.full_name}: ₹{bill.total_amount:.2f}")

        self.stdout.write(self.style.SUCCESS(f"Complete: {count} monthly bills processed."))
