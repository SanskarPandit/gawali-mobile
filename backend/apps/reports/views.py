from rest_framework.views import APIView
from rest_framework.response import Response
from django.http import HttpResponse
from django.utils import timezone
from django.db.models import Sum, Count, F
from datetime import datetime, date, timedelta
import calendar
import csv
from apps.core.permissions import IsDairyUser
from apps.deliveries.models import DailyDelivery
from apps.billing.models import Bill, BillItem
from apps.payments.models import Payment

def parse_report_dates(request):
    preset = request.query_params.get('preset')
    today = timezone.localdate()

    if preset == 'last_7d':
        start_date = today - timedelta(days=6)
        end_date = today
    elif preset == 'last_30d':
        start_date = today - timedelta(days=29)
        end_date = today
    elif preset == 'last_month':
        first_of_this_month = today.replace(day=1)
        last_day_last_month = first_of_this_month - timedelta(days=1)
        start_date = last_day_last_month.replace(day=1)
        end_date = last_day_last_month
    elif preset == 'this_month' or not request.query_params.get('from'):
        start_date = today.replace(day=1)
        end_date = today
    else:
        try:
            start_date = datetime.strptime(request.query_params.get('from'), '%Y-%m-%d').date()
            end_date = datetime.strptime(request.query_params.get('to'), '%Y-%m-%d').date()
        except (ValueError, TypeError):
            start_date = today.replace(day=1)
            end_date = today

    return start_date, end_date

class DairyReportsView(APIView):
    """Generates dairy vendor financial and volume metrics with breakdowns."""
    permission_classes = [IsDairyUser]

    def get(self, request):
        dairy = request.user.dairy
        start_date, end_date = parse_report_dates(request)

        # 1. Deliveries in range
        deliveries = DailyDelivery.objects.filter(
            subscription__customer__dairy=dairy,
            delivery_date__range=(start_date, end_date),
            status=DailyDelivery.Status.DELIVERED
        ).select_related('subscription__product', 'subscription__customer__user')

        total_delivered_litres = deliveries.aggregate(total=Sum('delivered_quantity'))['total'] or 0.0

        # Calculate revenue earned (delivered qty * unit price)
        revenue_earned = 0.0
        product_aggregates = {}
        customer_aggregates = {}
        daily_aggregates = {}

        for deliv in deliveries:
            qty = float(deliv.delivered_quantity)
            price = float(deliv.subscription.product.price_per_unit)
            amount = qty * price
            revenue_earned += amount

            # Product breakdown
            prod_name = deliv.subscription.product.name
            if prod_name not in product_aggregates:
                product_aggregates[prod_name] = {'name': prod_name, 'quantity': 0.0, 'amount': 0.0, 'unit': deliv.subscription.product.unit}
            product_aggregates[prod_name]['quantity'] += qty
            product_aggregates[prod_name]['amount'] += amount

            # Customer breakdown
            cust_id = str(deliv.subscription.customer.id)
            cust_name = deliv.subscription.customer.user.full_name
            if cust_id not in customer_aggregates:
                customer_aggregates[cust_id] = {'customer_id': cust_id, 'name': cust_name, 'quantity': 0.0, 'amount': 0.0}
            customer_aggregates[cust_id]['quantity'] += qty
            customer_aggregates[cust_id]['amount'] += amount

            # Daily breakdown
            d_str = deliv.delivery_date.isoformat()
            if d_str not in daily_aggregates:
                daily_aggregates[d_str] = {'date': d_str, 'quantity': 0.0, 'amount': 0.0}
            daily_aggregates[d_str]['quantity'] += qty
            daily_aggregates[d_str]['amount'] += amount

        # 2. Total Billed in this period
        bills = Bill.objects.filter(
            dairy=dairy,
            billing_month__gte=start_date.replace(day=1),
            billing_month__lte=end_date
        )
        total_billed = bills.aggregate(total=Sum('total_amount'))['total'] or 0.0

        # 3. Total Collected in this period
        payments = Payment.objects.filter(
            bill__dairy=dairy,
            paid_at__date__range=(start_date, end_date),
            status='success'
        )
        total_collected = payments.aggregate(total=Sum('amount'))['total'] or 0.0

        # Sort top customers
        top_customers = sorted(customer_aggregates.values(), key=lambda x: x['amount'], reverse=True)[:10]

        # Sort daily breakdown
        daily_breakdown = sorted(daily_aggregates.values(), key=lambda x: x['date'], reverse=True)

        return Response({
            'from': start_date.isoformat(),
            'to': end_date.isoformat(),
            'summary': {
                'delivered_litres': round(float(total_delivered_litres), 1),
                'revenue_earned': round(revenue_earned, 2),
                'total_billed': round(float(total_billed), 2),
                'total_collected': round(float(total_collected), 2),
            },
            'by_product': list(product_aggregates.values()),
            'top_customers': top_customers,
            'daily_breakdown': daily_breakdown
        })

class ExportReportsCsvView(APIView):
    """Exports daily delivery report directly as CSV matching web app button."""
    permission_classes = [IsDairyUser]

    def get(self, request):
        dairy = request.user.dairy
        start_date, end_date = parse_report_dates(request)

        deliveries = DailyDelivery.objects.filter(
            subscription__customer__dairy=dairy,
            delivery_date__range=(start_date, end_date)
        ).select_related('subscription__customer__user', 'subscription__product').order_by('delivery_date')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="gawali_report_{start_date}_{end_date}.csv"'

        writer = csv.writer(response)
        writer.writerow(['Date', 'Customer Name', 'Phone', 'Address', 'Product', 'Scheduled Qty', 'Delivered Qty', 'Rate (INR)', 'Total Amount (INR)', 'Status'])

        for d in deliveries:
            cust = d.subscription.customer
            prod = d.subscription.product
            rate = float(prod.price_per_unit)
            qty = float(d.delivered_quantity)
            amt = qty * rate
            writer.writerow([
                d.delivery_date.isoformat(),
                cust.user.full_name,
                cust.user.phone or '',
                cust.address,
                prod.name,
                float(d.scheduled_quantity),
                qty,
                rate,
                round(amt, 2),
                d.status
            ])

        return response
