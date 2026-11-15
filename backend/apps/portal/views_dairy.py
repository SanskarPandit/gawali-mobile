import random
import re
from collections import defaultdict
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q, Sum
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.services import generate_temporary_password
from apps.assistant.services import dairy_insights, parse_lab_report
from apps.notifications.models import Notification
from apps.ops.billing import dues_report, dues_status, release_holds
from apps.core.permissions import IsDairyUser
from apps.core.scheduling import earliest_changeable_date, refresh_manifests
from apps.customers.models import CustomerProfile
from apps.dairies.models import DeliveryRoute
from apps.deliveries.models import DailyDelivery, DeliveryBoy
from apps.deliveries.services import generate_daily_deliveries
from apps.products.models import Product
from apps.quality.models import MilkBatch
from apps.quality.passport import passport_dict
from apps.refunds.models import RefundClaim
from apps.subscriptions.models import Order, Subscription
from apps.wallet import services as wallet_services
from apps.wallet.models import PackagingEntry, Wallet, WalletTransaction
from . import services
from .common import dairy_of, parse_bool, parse_date, parse_decimal, require
from .schedule import burn_rate, cutoff_info, product_brief, project
from .views_customer import bottles_dict, claim_dict, doorstep_dict, sub_dict, txn_dict

ZERO = Decimal('0')


class DairyView(APIView):
    permission_classes = [IsDairyUser]

    @property
    def dairy(self):
        return dairy_of(self.request)


def _demand(dairy, day):
    """Litres/units per product scheduled for a day (projected for future days, actual rows otherwise)."""
    generate_daily_deliveries(day, dairy=dairy) if day <= timezone.localdate() + timedelta(days=1) else None
    rows = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=day) \
        .exclude(status=DailyDelivery.Status.SKIPPED).values(
            'subscription__product_id', 'subscription__product__name', 'subscription__product__unit',
            'subscription__product__price_per_unit').annotate(qty=Sum('scheduled_quantity'), n=Count('id'))
    out = {r['subscription__product_id']: {
        'product_id': str(r['subscription__product_id']), 'name': r['subscription__product__name'],
        'unit': r['subscription__product__unit'], 'quantity': r['qty'] or ZERO, 'households': r['n'],
        'amount': (r['qty'] or ZERO) * r['subscription__product__price_per_unit'],
    } for r in rows}
    for o in Order.objects.filter(dairy=dairy, delivery_date=day).exclude(status='cancelled').select_related('product'):
        e = out.setdefault(o.product_id, {'product_id': str(o.product_id), 'name': o.product.name, 'unit': o.product.unit,
                                          'quantity': ZERO, 'households': 0, 'amount': ZERO})
        e['quantity'] += o.quantity
        e['households'] += 1
        e['amount'] += o.total_price
    return sorted(out.values(), key=lambda e: -e['amount'])


UNIT_RE = re.compile(r'^\s*(\d+(?:\.\d+)?)?\s*(ml|l|litre|liter)(?![a-z])', re.I)


def unit_litres(unit: str) -> Decimal | None:
    """Litres in one unit of a product: '1 L' → 1, '500 ml bottle' → 0.5, 'L' → 1. None for non-liquids."""
    m = UNIT_RE.match(unit or '')
    if not m:
        return None
    n = Decimal(m.group(1) or '1')
    return n / 1000 if m.group(2).lower() == 'ml' else n


def _litres(lines):
    return sum((l['quantity'] * (unit_litres(l['unit']) or ZERO) for l in lines), ZERO)


class OverviewView(DairyView):
    def get(self, request):
        dairy = self.dairy
        today = timezone.localdate()
        tomorrow = today + timedelta(days=1)
        customers = CustomerProfile.objects.filter(dairy=dairy, is_active=True, user__is_deleted=False)

        # Every figure below comes from a handful of bulk queries: the database can be a network hop away.
        generate_daily_deliveries(today, dairy=dairy)
        progress = {'pending': 0, 'delivered': 0, 'missed': 0, 'skipped': 0}
        for row in DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=today) \
                .values('status').annotate(n=Count('subscription__customer', distinct=True)):
            if row['status'] in progress:
                progress[row['status']] = row['n']

        demand_tomorrow = _demand(dairy, tomorrow)
        start = today - timedelta(days=13)
        days = {start + timedelta(days=i): {'revenue': ZERO, 'litres': ZERO, 'drops': set()} for i in range(14)}
        for qty_, price, unit, cust, d in DailyDelivery.objects.filter(
                subscription__customer__dairy=dairy, delivery_date__range=(start, today), status='delivered',
        ).values_list('delivered_quantity', 'subscription__product__price_per_unit', 'subscription__product__unit',
                      'subscription__customer_id', 'delivery_date'):
            days[d]['revenue'] += qty_ * price
            days[d]['litres'] += qty_ * (unit_litres(unit) or ZERO)
            days[d]['drops'].add(cust)
        for d, total in Order.objects.filter(dairy=dairy, delivery_date__range=(start, today), status='delivered') \
                .values_list('delivery_date').annotate(t=Sum('total_price')):
            days[d]['revenue'] += total or ZERO
        series = [{'date': d.isoformat(), 'revenue': v['revenue'].quantize(Decimal('0.01')),
                   'litres': v['litres'].quantize(Decimal('0.1')), 'drops': len(v['drops'])} for d, v in sorted(days.items())]

        week_avg_litres = sum((s['litres'] for s in series[-7:]), ZERO) / 7
        tomorrow_litres = _litres(demand_tomorrow)
        month_start = today.replace(day=1)
        txns = WalletTransaction.objects.filter(wallet__customer__dairy=dairy, created_at__date__gte=month_start)
        collected = txns.filter(direction='debit', kind__in=('delivery', 'order', 'autopay')).aggregate(t=Sum('amount'))['t'] or ZERO
        refunded = txns.filter(kind='refund').aggregate(t=Sum('amount'))['t'] or ZERO

        # Low balance / dues: less than two days of the household's active plan (negative = owes the dairy).
        daily_value = defaultdict(lambda: ZERO)
        for cid, q_, price in Subscription.objects.filter(customer__in=customers, status='active') \
                .values_list('customer_id', 'default_quantity', 'product__price_per_unit'):
            daily_value[cid] += q_ * price
        low = []
        for w in Wallet.objects.filter(customer__in=customers).select_related('customer__user'):
            daily = daily_value.get(w.customer_id, ZERO)
            if daily > 0 and w.balance < daily * 2 and (w.billing_mode == 'wallet' or not settings.PAYMENTS_ENABLED):
                low.append({'customer_id': str(w.customer_id), 'name': w.customer.user.full_name, 'balance': w.balance,
                            'daily': daily})
        low.sort(key=lambda x: x['balance'])
        packaging = dict(PackagingEntry.objects.filter(customer__dairy=dairy, kind__in=('bottle_issued', 'bottle_returned'))
                         .values_list('kind').annotate(n=Sum('count')))
        issued, returned = packaging.get('bottle_issued') or 0, packaging.get('bottle_returned') or 0
        open_refunds = RefundClaim.objects.filter(customer__dairy=dairy, status='under_review').count()
        skips_tomorrow = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=tomorrow,
                                                      status='skipped').values('subscription__customer').distinct().count()

        kpis = {
            'active_households': customers.filter(subscriptions__status='active').distinct().count(),
            'new_this_month': customers.filter(created_at__date__gte=month_start).count(),
            'tomorrow_litres': float(tomorrow_litres), 'tomorrow_revenue': float(sum((l['amount'] for l in demand_tomorrow), ZERO)),
            'demand_change_pct': float((tomorrow_litres - week_avg_litres) / week_avg_litres * 100) if week_avg_litres else None,
            'top_product': demand_tomorrow[0]['name'] if demand_tomorrow else None,
            'month_collected': float(collected), 'month_refunded': float(refunded),
            'low_balance_customers': len(low), 'open_refunds': open_refunds,
            'bottles_outstanding': max(0, issued - returned), 'deposits_held': float(max(0, issued - returned) * dairy.bottle_deposit),
            'skips_tomorrow': skips_tomorrow,
            'partners_active': DeliveryBoy.objects.filter(dairy=dairy, is_active=True).count(),
        }
        return Response({
            'dairy': {'id': str(dairy.id), 'name': dairy.business_name, 'hub_name': dairy.hub_name},
            'cutoff': cutoff_info(dairy), 'kpis': kpis, 'today_progress': progress,
            'demand_tomorrow': demand_tomorrow, 'series': series, 'low_balance': low[:8],
        })


class InsightsView(DairyView):
    def get(self, request):
        overview = OverviewView()
        overview.request = request
        kpis = overview.get(request).data['kpis']
        return Response(dairy_insights(str(self.dairy.id), kpis))


def _stop_dict(request, customer, rows, orders, day):
    items = [{'delivery_id': str(r.id), 'product': product_brief(r.subscription.product), 'quantity': r.scheduled_quantity,
              'delivered_quantity': r.delivered_quantity, 'status': r.status} for r in rows]
    statuses = {r.status for r in rows if r.scheduled_quantity > 0} | {('delivered' if o.status == 'delivered' else 'pending')
                                                                       for o in orders}
    status = ('delivered' if statuses == {'delivered'} else 'missed' if 'missed' in statuses else
              'pending' if 'pending' in statuses else 'skipped' if not statuses or statuses == {'skipped'} else 'partial')
    proof = next((r.proof_photo for r in rows if r.proof_photo), None)
    delivered_at = next((r.delivered_at for r in rows if r.delivered_at), None) or next((o.delivered_at for o in orders if o.delivered_at), None)
    return {
        'customer_id': str(customer.id), 'name': customer.user.full_name, 'phone': customer.user.phone,
        'address': customer.address, 'flat': customer.flat_or_house_number, 'landmark': customer.landmark,
        'society_name': customer.society_name, 'instructions': customer.delivery_instructions,
        'stop_order': customer.route_stop_order, 'route_id': str(customer.delivery_route_id) if customer.delivery_route_id else None,
        'route_name': customer.delivery_route.name if customer.delivery_route else 'Unassigned',
        'doorstep': doorstep_dict(customer),
        'gate_token': services.gate_token(customer, day) if customer.society_gate_pass else None,
        'items': items,
        'orders': [{'id': str(o.id), 'product': product_brief(o.product), 'quantity': o.quantity, 'status': o.status,
                    'is_express': o.is_express} for o in orders],
        'status': status, 'is_express': any(o.is_express and o.status == 'pending' for o in orders),
        'proof_photo': proof.url if proof else None,
        'delivered_at': timezone.localtime(delivered_at).isoformat() if delivered_at else None,
        'bottles_with_customer': wallet_services.bottles_with_customer(customer),
        'glass_bottles_today': sum(int(r.scheduled_quantity + Decimal('0.99')) for r in rows
                                   if r.subscription.product.container == 'glass_bottle'),
        'latitude': customer.latitude, 'longitude': customer.longitude,
    }


def build_stops(request, dairy, day, route_id=None):
    if day <= timezone.localdate() + timedelta(days=1):
        generate_daily_deliveries(day, dairy=dairy)
    rows = DailyDelivery.objects.filter(subscription__customer__dairy=dairy, delivery_date=day) \
        .select_related('subscription__product', 'subscription__customer__user', 'subscription__customer__delivery_route')
    orders = Order.objects.filter(dairy=dairy, delivery_date=day).exclude(status='cancelled') \
        .select_related('product', 'customer__user', 'customer__delivery_route')
    if route_id == 'none':
        rows, orders = rows.filter(subscription__customer__delivery_route__isnull=True), orders.filter(customer__delivery_route__isnull=True)
    elif route_id:
        rows, orders = rows.filter(subscription__customer__delivery_route_id=route_id), orders.filter(customer__delivery_route_id=route_id)
    by_customer, customers = defaultdict(lambda: ([], [])), {}
    for r in rows:
        c = r.subscription.customer
        customers[c.id] = c
        by_customer[c.id][0].append(r)
    for o in orders:
        customers[o.customer_id] = o.customer
        by_customer[o.customer_id][1].append(o)
    stops = [_stop_dict(request, customers[cid], *by_customer[cid], day) for cid in customers]
    stops = [s for s in stops if s['status'] != 'skipped' or s['orders']] + [s for s in stops if s['status'] == 'skipped' and not s['orders']]
    stops.sort(key=lambda s: (s['status'] == 'skipped', not s['is_express'], s['route_name'], s['stop_order'], s['name']))
    return stops


def load_sheet(stops):
    totals = {}
    for s in stops:
        if s['status'] == 'skipped':
            continue
        for line in s['items'] + s['orders']:
            if line['quantity'] <= 0:
                continue
            p = line['product']
            e = totals.setdefault(p['id'], {'product': p, 'quantity': ZERO, 'households': 0})
            e['quantity'] += line['quantity']
            e['households'] += 1
    return sorted(totals.values(), key=lambda e: e['product']['name'])


class ManifestView(DairyView):
    def get(self, request):
        day = parse_date(request.query_params.get('date'), default=timezone.localdate())
        stops = build_stops(request, self.dairy, day, request.query_params.get('route_id'))
        routes = defaultdict(lambda: {'total': 0, 'delivered': 0, 'pending': 0, 'missed': 0})
        for s in stops:
            if s['status'] == 'skipped':
                continue
            r = routes[s['route_name']]
            r['total'] += 1
            if s['status'] in r:
                r[s['status']] += 1
        partners = {p.assigned_route.name if p.assigned_route else 'Unassigned': p.user.full_name
                    for p in DeliveryBoy.objects.filter(dairy=self.dairy, is_active=True).select_related('assigned_route', 'user')}
        return Response({
            'date': day.isoformat(), 'stops': stops, 'load_sheet': load_sheet(stops),
            'routes': [{'name': k, 'partner': partners.get(k), **v} for k, v in sorted(routes.items())],
        })


def customer_row(c, outstanding=None):
    wallet = getattr(c, 'wallet', None)
    subs = [s for s in c.subscriptions.all() if s.status in ('active', 'paused')]
    return {
        'id': str(c.id), 'name': c.user.full_name, 'email': c.user.email, 'phone': c.user.phone,
        'address': c.address, 'flat': c.flat_or_house_number, 'society_name': c.society_name,
        'route_id': str(c.delivery_route_id) if c.delivery_route_id else None,
        'route_name': c.delivery_route.name if c.delivery_route else None, 'stop_order': c.route_stop_order,
        'is_active': c.is_active, 'wallet_balance': wallet.balance if wallet else ZERO,
        'billing_mode': wallet.billing_mode if wallet else 'wallet',
        'plan': [{'product': s.product.name, 'quantity': s.default_quantity, 'unit': s.product.unit, 'status': s.status} for s in subs],
        'daily_value': sum((s.default_quantity * s.product.price_per_unit for s in subs if s.status == 'active'), ZERO),
        'over_limit': bool(wallet and c.dairy and -wallet.balance >= c.dairy.credit_limit > 0),
        'joined': c.created_at.date().isoformat(),
    }


class CustomersView(DairyView):
    def get(self, request):
        qs = CustomerProfile.objects.filter(dairy=self.dairy, user__is_deleted=False) \
            .select_related('user', 'delivery_route', 'wallet').prefetch_related('subscriptions__product')
        p = request.query_params
        if p.get('search'):
            s = p['search']
            qs = qs.filter(Q(user__full_name__icontains=s) | Q(user__phone__icontains=s) | Q(address__icontains=s)
                           | Q(society_name__icontains=s) | Q(user__email__icontains=s))
        if p.get('route_id') == 'none':
            qs = qs.filter(delivery_route__isnull=True)
        elif p.get('route_id'):
            qs = qs.filter(delivery_route_id=p['route_id'])
        if p.get('status') == 'inactive':
            qs = qs.filter(is_active=False)
        elif p.get('status') != 'all':
            qs = qs.filter(is_active=True)
        return Response([customer_row(c) for c in qs.order_by('delivery_route__sort_order', 'route_stop_order', 'user__full_name')])

    @transaction.atomic
    def post(self, request):
        d = request.data
        require(d, 'full_name', 'email', 'phone', 'address')
        email, phone = d['email'].strip().lower(), d['phone'].strip()
        if User.all_objects.filter(Q(email=email) | Q(phone=phone)).exists():
            raise ValidationError({'email': ['A user with this email or phone already exists.']})
        route = None
        if d.get('route_id'):
            route = DeliveryRoute.objects.filter(id=d['route_id'], dairy=self.dairy).first()
            if route is None:
                raise ValidationError({'route_id': ['Route not found.']})
        password = generate_temporary_password()
        user = User.objects.create_user(email=email, password=password, phone=phone, full_name=d['full_name'].strip(),
                                        role=User.Role.CUSTOMER)
        last = CustomerProfile.objects.filter(dairy=self.dairy, delivery_route=route).order_by('-route_stop_order').first()
        c = CustomerProfile.objects.create(
            user=user, dairy=self.dairy, delivery_route=route, address=d['address'].strip(),
            flat_or_house_number=d.get('flat', '').strip(), landmark=d.get('landmark', '').strip(),
            society_name=d.get('society_name', '').strip(), society_gate_pass=bool(d.get('society_name')),
            delivery_instructions=d.get('instructions', '').strip(),
            route_stop_order=(last.route_stop_order + 1) if last else 1,
        )
        wallet = wallet_services.get_wallet(c)
        opening = parse_decimal(d.get('opening_balance'), 'opening_balance', ZERO, Decimal('20000'), required=False)
        if opening:
            wallet_services.credit(c, opening, WalletTransaction.Kind.TOPUP, 'Opening balance (collected by dairy)')
        if d.get('product_id'):
            product = Product.objects.filter(id=d['product_id'], dairy=self.dairy).first()
            if product is None:
                raise ValidationError({'product_id': ['Product not found.']})
            qty = parse_decimal(d.get('quantity', 1), 'quantity', Decimal('0.5'), Decimal('20'))
            Subscription.objects.create(customer=c, product=product, default_quantity=qty,
                                        start_date=earliest_changeable_date(self.dairy))
        c.refresh_from_db()
        return Response({**customer_row(c), 'temporary_password': password}, status=201)


class CustomerDetailView(DairyView):
    def _get(self, pk):
        c = CustomerProfile.objects.filter(id=pk, dairy=self.dairy).select_related('user', 'delivery_route').first()
        if c is None:
            raise NotFound('Customer not found.')
        return c

    def get(self, request, pk):
        c = self._get(pk)
        today = timezone.localdate()
        wallet = wallet_services.get_wallet(c)
        subs = c.subscriptions.exclude(status='cancelled').select_related('product')
        return Response({
            **customer_row(c), 'landmark': c.landmark, 'instructions': c.delivery_instructions,
            'doorstep': doorstep_dict(c), 'subscriptions': [sub_dict(s) for s in subs],
            'wallet': {'balance': wallet.balance, 'billing_mode': wallet.billing_mode, 'autopay_status': wallet.autopay_status,
                       'burn': burn_rate(c, wallet)},
            'dues': dues_status(c, wallet),
            'transactions': [txn_dict(t) for t in wallet.transactions.all()[:25]],
            'bottles': bottles_dict(c),
            'history': [d.as_dict(request) for d in project(c, today - timedelta(days=13), today + timedelta(days=6))],
            'claims': [claim_dict(request, r) for r in RefundClaim.objects.filter(customer=c)
                       .select_related('delivery__subscription__product', 'customer__user')[:10]],
        })

    def patch(self, request, pk):
        c = self._get(pk)
        d = request.data
        for f, attr in (('address', 'address'), ('flat', 'flat_or_house_number'), ('landmark', 'landmark'),
                        ('society_name', 'society_name'), ('instructions', 'delivery_instructions')):
            if f in d:
                setattr(c, attr, str(d[f]).strip()[:500])
        if 'route_id' in d:
            if d['route_id']:
                route = DeliveryRoute.objects.filter(id=d['route_id'], dairy=self.dairy).first()
                if route is None:
                    raise ValidationError({'route_id': ['Route not found.']})
                c.delivery_route = route
            else:
                c.delivery_route = None
        if 'stop_order' in d:
            c.route_stop_order = int(d['stop_order'])
        if 'is_active' in d:
            c.is_active = parse_bool(d['is_active'])
        c.save()
        refresh_manifests(self.dairy, [timezone.localdate() + timedelta(days=1)])
        return self.get(request, pk)


class CustomerPaymentView(DairyView):
    """Dairy records a payment collected directly (cash / its own UPI) against a household's dues."""

    def post(self, request, pk):
        c = CustomerProfile.objects.filter(id=pk, dairy=self.dairy).first()
        if c is None:
            raise NotFound('Customer not found.')
        amount = parse_decimal(request.data.get('amount'), 'amount', Decimal('1'), Decimal('20000'))
        t = wallet_services.record_offline_payment(c, amount, request.data.get('method', 'cash'), request.user)
        released = release_holds(c)
        Notification.objects.create(user=c.user, title='Payment received',
                                    body=f'{self.dairy.business_name} recorded ₹{amount:,.0f}.' + (' Your deliveries are back on.' if released else ''),
                                    notification_type=Notification.NotificationType.PAYMENT_RECEIVED)
        return Response({**txn_dict(t), 'balance': wallet_services.get_wallet(c).balance, 'holds_released': released}, status=201)


class BatchParseReportView(DairyView):
    """Photo of a lab certificate in, batch form fields out (Nemotron Parse)."""
    throttle_scope = 'ai'

    def post(self, request):
        f = request.FILES.get('report')
        if f is None:
            raise ValidationError({'report': ['Attach a photo of the lab report.']})
        if f.size > 6 * 1024 * 1024:
            raise ValidationError({'report': ['Keep the image under 6 MB.']})
        result = parse_lab_report(f.read(), getattr(f, 'content_type', 'image/png'))
        if result['error'] and not result['fields']:
            raise ValidationError({'report': [result['error']]})
        return Response(result)


class CustomerSubscriptionView(DairyView):
    """Dairy adds a plan line for a household, or changes one."""

    def post(self, request, pk):
        c = CustomerProfile.objects.filter(id=pk, dairy=self.dairy).first()
        if c is None:
            raise NotFound('Customer not found.')
        require(request.data, 'product_id')
        product = Product.objects.filter(id=request.data['product_id'], dairy=self.dairy).first()
        if product is None:
            raise NotFound('Product not found.')
        if c.subscriptions.filter(product=product, status__in=('active', 'paused')).exists():
            raise ValidationError({'product_id': ['This household already subscribes to it.']})
        s = Subscription.objects.create(customer=c, product=product, start_date=earliest_changeable_date(self.dairy),
                                        default_quantity=parse_decimal(request.data.get('quantity', 1), 'quantity', Decimal('0.5'), Decimal('20')))
        return Response(sub_dict(s), status=201)

    def patch(self, request, pk):
        s = Subscription.objects.filter(id=pk, customer__dairy=self.dairy).select_related('product').first()
        if s is None:
            raise NotFound('Subscription not found.')
        if 'default_quantity' in request.data:
            s.default_quantity = parse_decimal(request.data['default_quantity'], 'default_quantity', Decimal('0.5'), Decimal('20'))
        if request.data.get('status') in Subscription.Status.values:
            s.status = request.data['status']
            if s.status == 'cancelled':
                s.end_date = earliest_changeable_date(self.dairy) - timedelta(days=1)
        s.save()
        refresh_manifests(self.dairy, [earliest_changeable_date(self.dairy)])
        return Response(sub_dict(s))


PRODUCT_FIELDS = ('name', 'unit', 'description', 'image_url', 'kind', 'category', 'container', 'animal')
PRODUCT_FLAGS = ('is_available', 'is_new', 'is_featured')


def product_dict(p: Product, stats=None) -> dict:
    return {**product_brief(p), 'description': p.description, 'kind': p.kind, 'is_available': p.is_available,
            'is_new': p.is_new, 'is_featured': p.is_featured, 'fat_percent': p.fat_percent,
            'subscribers': (stats or {}).get(p.id, 0), 'created_at': p.created_at.isoformat()}


def _apply_product(p: Product, d):
    for f in PRODUCT_FIELDS:
        if f in d:
            setattr(p, f, (str(d[f]).strip() if d[f] is not None else '') or (None if f == 'image_url' else ''))
    for f in PRODUCT_FLAGS:
        if f in d:
            setattr(p, f, parse_bool(d[f]))
    if 'price' in d:
        p.price_per_unit = parse_decimal(d['price'], 'price', Decimal('1'), Decimal('100000'))
    if 'step' in d:
        p.quantity_step = parse_decimal(d['step'], 'step', Decimal('0.25'), Decimal('10'))
    if 'fat_percent' in d:
        p.fat_percent = parse_decimal(d['fat_percent'], 'fat_percent', Decimal('0'), Decimal('15'), required=False)
    for f, choices in (('category', Product.Category), ('container', Product.Container), ('animal', Product.Animal),
                       ('kind', Product.Kind)):
        if getattr(p, f) not in choices.values:
            raise ValidationError({f: ['Choose a valid option.']})
    if not p.name:
        raise ValidationError({'name': ['Enter a product name.']})
    if not p.unit:
        raise ValidationError({'unit': ['Enter a unit, e.g. 500 ml or 1 L.']})


class ProductsView(DairyView):
    def get(self, request):
        stats = dict(Subscription.objects.filter(customer__dairy=self.dairy, status='active').values_list('product_id')
                     .annotate(n=Count('id')))
        return Response([product_dict(p, stats) for p in Product.objects.filter(dairy=self.dairy).order_by('category', 'name')])

    def post(self, request):
        require(request.data, 'name', 'unit', 'price')
        p = Product(dairy=self.dairy, price_per_unit=Decimal('1'))
        _apply_product(p, request.data)
        p.save()
        return Response(product_dict(p), status=201)


class ProductDetailView(DairyView):
    def _get(self, pk):
        p = Product.objects.filter(id=pk, dairy=self.dairy).first()
        if p is None:
            raise NotFound('Product not found.')
        return p

    def patch(self, request, pk):
        p = self._get(pk)
        _apply_product(p, request.data)
        p.save()
        return Response(product_dict(p))

    def delete(self, request, pk):
        p = self._get(pk)
        if Subscription.objects.filter(product=p, status__in=('active', 'paused')).exists():
            p.is_available = False
            p.save(update_fields=['is_available', 'updated_at'])
            return Response({'detail': 'Households still subscribe to this, so it was hidden from the shop instead.',
                             'archived': True})
        p.delete()
        return Response(status=204)


def route_dict(r: DeliveryRoute) -> dict:
    partner = r.delivery_boys.filter(is_active=True).select_related('user').first()
    return {'id': str(r.id), 'name': r.name, 'description': r.description, 'sort_order': r.sort_order,
            'households': r.customers.filter(is_active=True).count(),
            'partner': {'id': str(partner.id), 'name': partner.user.full_name} if partner else None}


class RoutesView(DairyView):
    def get(self, request):
        return Response([route_dict(r) for r in DeliveryRoute.objects.filter(dairy=self.dairy)])

    def post(self, request):
        require(request.data, 'name')
        name = request.data['name'].strip()
        if DeliveryRoute.all_objects.filter(dairy=self.dairy, name=name).exists():
            raise ValidationError({'name': ['A route with this name already exists.']})
        r = DeliveryRoute.objects.create(dairy=self.dairy, name=name, description=request.data.get('description', ''),
                                         sort_order=DeliveryRoute.objects.filter(dairy=self.dairy).count() + 1)
        return Response(route_dict(r), status=201)


class RouteDetailView(DairyView):
    def _get(self, pk):
        r = DeliveryRoute.objects.filter(id=pk, dairy=self.dairy).first()
        if r is None:
            raise NotFound('Route not found.')
        return r

    def patch(self, request, pk):
        r = self._get(pk)
        if request.data.get('name', '').strip():
            r.name = request.data['name'].strip()
        if 'description' in request.data:
            r.description = request.data['description']
        r.save()
        return Response(route_dict(r))

    def delete(self, request, pk):
        r = self._get(pk)
        if r.customers.filter(is_active=True).exists():
            raise ValidationError({'detail': 'Move this route\'s households to another route first.'})
        r.hard_delete()
        return Response(status=204)


class RouteReorderView(DairyView):
    @transaction.atomic
    def post(self, request, pk):
        r = DeliveryRoute.objects.filter(id=pk, dairy=self.dairy).first()
        if r is None:
            raise NotFound('Route not found.')
        ids = request.data.get('customer_ids') or []
        customers = {str(c.id): c for c in CustomerProfile.objects.filter(dairy=self.dairy, delivery_route=r, id__in=ids)}
        for pos, cid in enumerate(ids, start=1):
            if cid in customers:
                customers[cid].route_stop_order = pos
                customers[cid].save(update_fields=['route_stop_order', 'updated_at'])
        return Response({'success': True})


def partner_dict(p: DeliveryBoy) -> dict:
    today = timezone.localdate()
    done = DailyDelivery.objects.filter(delivered_by=p.user, delivery_date=today, status='delivered') \
        .values('subscription__customer').distinct().count()
    return {'id': str(p.id), 'user_id': str(p.user_id), 'name': p.user.full_name, 'email': p.user.email,
            'phone': p.user.phone, 'vehicle_number': p.vehicle_number, 'is_active': p.is_active and p.user.is_active,
            'route_id': str(p.assigned_route_id) if p.assigned_route_id else None,
            'route_name': p.assigned_route.name if p.assigned_route else None, 'delivered_today': done,
            'lifetime_drops': DailyDelivery.objects.filter(delivered_by=p.user, status='delivered')
            .values('subscription__customer', 'delivery_date').distinct().count()}


class PartnersView(DairyView):
    def get(self, request):
        return Response([partner_dict(p) for p in DeliveryBoy.objects.filter(dairy=self.dairy).select_related('user', 'assigned_route')])

    @transaction.atomic
    def post(self, request):
        d = request.data
        require(d, 'full_name', 'email', 'phone')
        email, phone = d['email'].strip().lower(), d['phone'].strip()
        if User.all_objects.filter(Q(email=email) | Q(phone=phone)).exists():
            raise ValidationError({'email': ['A user with this email or phone already exists.']})
        route = DeliveryRoute.objects.filter(id=d.get('route_id'), dairy=self.dairy).first() if d.get('route_id') else None
        password = d.get('password') or generate_temporary_password()
        user = User.objects.create_user(email=email, password=password, phone=phone, full_name=d['full_name'].strip(),
                                        role=User.Role.DELIVERY_BOY)
        p = DeliveryBoy.objects.create(user=user, dairy=self.dairy, assigned_route=route,
                                       vehicle_number=d.get('vehicle_number', '').strip())
        return Response({**partner_dict(p), 'temporary_password': password}, status=201)


class PartnerDetailView(DairyView):
    def patch(self, request, pk):
        p = DeliveryBoy.objects.filter(id=pk, dairy=self.dairy).select_related('user').first()
        if p is None:
            raise NotFound('Partner not found.')
        d = request.data
        if 'route_id' in d:
            p.assigned_route = DeliveryRoute.objects.filter(id=d['route_id'], dairy=self.dairy).first() if d['route_id'] else None
        if 'vehicle_number' in d:
            p.vehicle_number = d['vehicle_number'].strip()
        body = {}
        if 'is_active' in d:
            p.is_active = parse_bool(d['is_active'])
            p.user.is_active = p.is_active
            p.user.save(update_fields=['is_active'])
        if parse_bool(d.get('reset_password', False)):
            body['temporary_password'] = generate_temporary_password()
            p.user.set_password(body['temporary_password'])
            p.user.save()
        p.save()
        return Response({**partner_dict(p), **body})


def simulated_cold_chain(milked_at: datetime, chill_minutes: int, chill_temp: float, delivery_date) -> list[dict]:
    """Sensor log a hub's IoT probes would emit: milking → chiller → cold store → reefer van → doorstep."""
    rng = random.Random(f'{milked_at.isoformat()}{chill_temp}')
    log = [{'t': milked_at.isoformat(), 'c': 34.0, 'phase': 'milking'}]
    chilled = milked_at + timedelta(minutes=chill_minutes)
    log.append({'t': (milked_at + timedelta(minutes=chill_minutes // 2)).isoformat(), 'c': round(12 + rng.random() * 3, 1), 'phase': 'chilling'})
    log.append({'t': chilled.isoformat(), 'c': round(chill_temp, 1), 'phase': 'chilling'})
    tz = timezone.get_current_timezone()
    dispatch = timezone.make_aware(datetime.combine(delivery_date, time(3, 30)), tz)
    drop = timezone.make_aware(datetime.combine(delivery_date, time(6, 0)), tz)
    t = chilled
    while t < dispatch - timedelta(hours=1):
        t += timedelta(hours=2)
        log.append({'t': min(t, dispatch).isoformat(), 'c': round(3.2 + rng.random() * 0.7, 1), 'phase': 'hub storage'})
    t = dispatch
    while t <= drop:
        log.append({'t': t.isoformat(), 'c': round(3.4 + rng.random() * 0.75, 1), 'phase': 'transit'})
        t += timedelta(minutes=45)
    return log


class BatchesView(DairyView):
    def get(self, request):
        qs = MilkBatch.objects.filter(dairy=self.dairy).annotate(n_deliveries=Count('deliveries'))[:40]
        return Response([{**passport_dict(b), 'deliveries': b.n_deliveries} for b in qs])

    @transaction.atomic
    def post(self, request):
        d = request.data
        require(d, 'delivery_date', 'fat_percent', 'snf_percent')
        day = parse_date(d['delivery_date'], 'delivery_date')
        tz = timezone.get_current_timezone()
        milked_at = timezone.make_aware(datetime.fromisoformat(d['milked_at']), tz) if d.get('milked_at') else \
            timezone.make_aware(datetime.combine(day - timedelta(days=1), time(16, 15)), tz)
        chill_minutes = int(d.get('chill_minutes') or 42)
        chill_temp = float(d.get('chill_temp') or 3.8)
        animal = d.get('animal') or 'cow'
        if animal not in Product.Animal.values:
            raise ValidationError({'animal': ['Choose cow, a2_cow or buffalo.']})
        n = MilkBatch.all_objects.filter(dairy=self.dairy, delivery_date=day).count()
        code = d.get('code') or f"{(self.dairy.hub_name or self.dairy.business_name)[:3].upper()}-{day:%m%d}-{chr(65 + n)}"
        vals = {f: parse_decimal(d.get(f, 0), f, Decimal('0'), Decimal('100')) for f in
                ('water_percent', 'detergent_percent', 'starch_percent', 'urea_percent')}
        fat = parse_decimal(d['fat_percent'], 'fat_percent', Decimal('0'), Decimal('15'))
        snf = parse_decimal(d['snf_percent'], 'snf_percent', Decimal('0'), Decimal('15'))
        log = d.get('temperature_log') if isinstance(d.get('temperature_log'), list) else \
            simulated_cold_chain(milked_at, chill_minutes, chill_temp, day)
        passed = all(v == 0 for v in vals.values()) and fat >= Decimal('3.0') and snf >= Decimal('8.0')
        b = MilkBatch.objects.create(
            dairy=self.dairy, code=code, animal=animal, delivery_date=day,
            hub_name=d.get('hub_name') or self.dairy.hub_name or self.dairy.business_name,
            milked_at=milked_at, chilled_at=milked_at + timedelta(minutes=chill_minutes), temperature_log=log,
            fat_percent=fat, snf_percent=snf, certified_by=d.get('certified_by', request.user.full_name),
            lab_name=d.get('lab_name') or 'In-house FSSAI-accredited lab',
            status=MilkBatch.Status.PASSED if passed else MilkBatch.Status.FAILED, **vals,
        )
        linked = services.assign_batch(b)
        return Response({**passport_dict(b), 'deliveries': linked}, status=201)


class BatchReadingView(DairyView):
    """IoT ingestion: a chiller or reefer probe posts a temperature reading for a batch."""

    def post(self, request, pk):
        b = MilkBatch.objects.filter(id=pk, dairy=self.dairy).first()
        if b is None:
            raise NotFound('Batch not found.')
        c = parse_decimal(request.data.get('c'), 'c', Decimal('-5'), Decimal('40'))
        phase = request.data.get('phase', 'transit')
        b.temperature_log = b.temperature_log + [{'t': timezone.now().isoformat(), 'c': float(c), 'phase': phase}]
        b.save(update_fields=['temperature_log', 'updated_at'])
        return Response(passport_dict(b))


class RefundsReviewView(DairyView):
    def get(self, request):
        qs = RefundClaim.objects.filter(customer__dairy=self.dairy) \
            .select_related('delivery__subscription__product', 'customer__user')
        if request.query_params.get('status'):
            qs = qs.filter(status=request.query_params['status'])
        totals = RefundClaim.objects.filter(customer__dairy=self.dairy).aggregate(
            credited=Sum('amount', filter=Q(status='credited')), n=Count('id'),
            auto=Count('id', filter=Q(status='credited', reviewed_note='')))
        avg_ms = [r.processing_ms for r in RefundClaim.objects.filter(customer__dairy=self.dairy, status='credited')[:100]]
        return Response({'claims': [claim_dict(request, r) for r in qs[:60]],
                         'stats': {'credited_total': totals['credited'] or ZERO, 'claims': totals['n'],
                                   'auto_resolved': totals['auto'],
                                   'avg_seconds': round(sum(avg_ms) / len(avg_ms) / 1000, 2) if avg_ms else None}})


class RefundDecisionView(DairyView):
    def post(self, request, pk):
        claim = RefundClaim.objects.filter(id=pk, customer__dairy=self.dairy).select_related('delivery__subscription__product', 'customer__user').first()
        if claim is None:
            raise NotFound('Claim not found.')
        claim = services.review_refund(claim, parse_bool(request.data.get('approve')), request.data.get('note', ''))
        return Response(claim_dict(request, claim))


class FinanceView(DairyView):
    def get(self, request):
        today = timezone.localdate()
        days = min(int(request.query_params.get('days', 30)), 120)
        start = today - timedelta(days=days - 1)
        txns = WalletTransaction.objects.filter(wallet__customer__dairy=self.dairy, created_at__date__gte=start) \
            .select_related('wallet__customer__user')
        by_kind = {r['kind']: r['t'] for r in txns.values('kind').annotate(t=Sum('amount'))}
        daily = defaultdict(lambda: {'collected': ZERO, 'refunds': ZERO, 'topups': ZERO})
        for t in txns:
            key = timezone.localtime(t.created_at).date().isoformat()
            if t.direction == 'debit' and t.kind in ('delivery', 'order', 'autopay'):
                daily[key]['collected'] += t.amount
            elif t.kind == 'refund':
                daily[key]['refunds'] += t.amount
            elif t.kind in ('topup', 'auto_topup'):
                daily[key]['topups'] += t.amount
        series = [{'date': (start + timedelta(days=i)).isoformat(), **daily[(start + timedelta(days=i)).isoformat()]}
                  for i in range(days)]
        wallets = Wallet.objects.filter(customer__dairy=self.dairy)
        return Response({
            'collected': sum((by_kind.get(k) or ZERO for k in ('delivery', 'order', 'autopay')), ZERO),
            'autopay': by_kind.get('autopay') or ZERO, 'refunds': by_kind.get('refund') or ZERO,
            'topups': (by_kind.get('topup') or ZERO) + (by_kind.get('auto_topup') or ZERO),
            'withdrawals': by_kind.get('withdrawal') or ZERO,
            'wallet_float': wallets.aggregate(t=Sum('balance'))['t'] or ZERO,
            'autopay_customers': wallets.filter(billing_mode='autopay', autopay_status='active').count(),
            'wallet_customers': wallets.filter(billing_mode='wallet').count(),
            'series': series,
            'dues': dues_report(self.dairy),
            'credit_limit': self.dairy.credit_limit,
            'transactions': [{**txn_dict(t), 'customer_name': t.wallet.customer.user.full_name,
                              'customer_id': str(t.wallet.customer_id)} for t in txns.order_by('-created_at')[:100]],
        })


SETTINGS_FIELDS = ('business_name', 'phone', 'address', 'city', 'pincode', 'hub_name', 'bank_upi_id')


class SettingsView(DairyView):
    def data(self, d):
        return {**{f: getattr(d, f) for f in SETTINGS_FIELDS}, 'cutoff_time': d.cutoff_time.strftime('%H:%M'),
                'slot_start': d.slot_start.strftime('%H:%M'), 'slot_end': d.slot_end.strftime('%H:%M'),
                'bottle_deposit': d.bottle_deposit, 'pouch_eco_credit': d.pouch_eco_credit,
                'credit_limit': d.credit_limit, 'hold_on_dues': d.hold_on_dues, 'cutoff_reminders': d.cutoff_reminders,
                'is_verified': d.is_verified, 'passport_enabled': settings.PASSPORT_ENABLED,
                'owner_name': self.request.user.full_name, 'email': self.request.user.email}

    def get(self, request):
        return Response(self.data(self.dairy))

    def patch(self, request):
        d, data = self.dairy, request.data
        for f in SETTINGS_FIELDS:
            if f in data:
                setattr(d, f, str(data[f]).strip())
        if not d.business_name:
            raise ValidationError({'business_name': ['Enter your dairy name.']})
        for f in ('cutoff_time', 'slot_start', 'slot_end'):
            if data.get(f):
                try:
                    setattr(d, f, time.fromisoformat(data[f]))
                except ValueError:
                    raise ValidationError({f: ['Use HH:MM.']})
        if d.slot_end <= d.slot_start:
            raise ValidationError({'slot_end': ['The slot must end after it starts.']})
        if 'bottle_deposit' in data:
            d.bottle_deposit = parse_decimal(data['bottle_deposit'], 'bottle_deposit', ZERO, Decimal('500'))
        if 'pouch_eco_credit' in data:
            d.pouch_eco_credit = parse_decimal(data['pouch_eco_credit'], 'pouch_eco_credit', ZERO, Decimal('100'))
        if 'credit_limit' in data:
            d.credit_limit = parse_decimal(data['credit_limit'], 'credit_limit', ZERO, Decimal('100000'))
        for flag in ('hold_on_dues', 'cutoff_reminders'):
            if flag in data:
                setattr(d, flag, parse_bool(data[flag]))
        d.save()
        return Response(self.data(d))


class GenerateManifestView(DairyView):
    def post(self, request):
        day = parse_date(request.data.get('date'), default=timezone.localdate() + timedelta(days=1))
        if day > timezone.localdate() + timedelta(days=1):
            raise ValidationError({'date': ['Manifests can be generated for today or tomorrow.']})
        return Response(generate_daily_deliveries(day, dairy=self.dairy))
