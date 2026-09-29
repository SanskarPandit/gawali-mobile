from django.utils import timezone
from django.core.files.base import ContentFile
from datetime import date, timedelta
from celery import shared_task
import calendar
import logging
from apps.deliveries.models import DailyDelivery
from apps.subscriptions.models import Order
from apps.customers.models import CustomerProfile
from .models import Bill, BillItem
from .pdf_generator import generate_bill_pdf_bytes

logger = logging.getLogger(__name__)

def generate_bill_for_customer_month(customer, billing_month_start):
    """Generates an itemized bill for a single customer for a given calendar month."""
    dairy = customer.dairy
    if not dairy:
        return None

    year = billing_month_start.year
    month = billing_month_start.month
    num_days = calendar.monthrange(year, month)[1]
    month_end = date(year, month, num_days)

    # Find or create bill for this month
    bill, created = Bill.objects.get_or_create(
        customer=customer,
        billing_month=billing_month_start,
        defaults={
            'dairy': dairy,
            'due_date': month_end + timedelta(days=10) # 10 days grace period
        }
    )

    # Clear old items if re-generating
    bill.items.all().delete()

    # 1. Fetch delivered milk
    deliveries = DailyDelivery.objects.filter(
        subscription__customer=customer,
        delivery_date__range=(billing_month_start, month_end),
        status=DailyDelivery.Status.DELIVERED,
        delivered_quantity__gt=0
    ).select_related('subscription__product')

    total_qty = 0.0
    total_amount = 0.0

    for deliv in deliveries:
        product = deliv.subscription.product
        qty = float(deliv.delivered_quantity)
        rate = float(product.price_per_unit)
        amt = qty * rate
        total_qty += qty
        total_amount += amt

        BillItem.objects.create(
            bill=bill,
            date=deliv.delivery_date,
            item_name=f"{product.name} ({product.unit})",
            quantity=qty,
            unit_price=rate,
            total_amount=amt
        )

    # 2. Fetch delivered one-time extras (curd, paneer, extra items)
    extra_orders = Order.objects.filter(
        customer=customer,
        delivery_date__range=(billing_month_start, month_end),
        status=Order.Status.DELIVERED
    ).select_related('product')

    for ord_item in extra_orders:
        qty = float(ord_item.quantity)
        rate = float(ord_item.unit_price)
        amt = float(ord_item.total_price)
        total_amount += amt

        BillItem.objects.create(
            bill=bill,
            date=ord_item.delivery_date,
            item_name=f"Extra: {ord_item.product.name}",
            quantity=qty,
            unit_price=rate,
            total_amount=amt
        )

    bill.total_quantity = total_qty
    bill.total_amount = total_amount
    bill.recalculate_due()

    # Generate and attach PDF
    try:
        pdf_bytes = generate_bill_pdf_bytes(bill)
        filename = f"bill_{customer.user.full_name.replace(' ', '_')}_{billing_month_start.strftime('%Y_%m')}.pdf"
        bill.pdf_file.save(filename, ContentFile(pdf_bytes), save=True)
    except Exception as e:
        logger.error(f"Error generating PDF for bill {bill.id}: {e}")

    return bill

@shared_task
def generate_monthly_bills_task():
    """Celery scheduled task running on the 1st of each month to generate previous month bills."""
    today = timezone.localdate()
    # Compute previous month
    first_of_this_month = today.replace(day=1)
    last_month_last_day = first_of_this_month - timedelta(days=1)
    target_month_start = last_month_last_day.replace(day=1)

    logger.info(f"Generating monthly bills for cycle: {target_month_start.strftime('%B %Y')}")
    customers = CustomerProfile.objects.filter(is_active=True).select_related('dairy', 'user')

    generated_count = 0
    for cust in customers:
        bill = generate_bill_for_customer_month(cust, target_month_start)
        if bill:
            generated_count += 1

    logger.info(f"Finished generating monthly bills: {generated_count} bills created.")
    return {'generated_count': generated_count}
