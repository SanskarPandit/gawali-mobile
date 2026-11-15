from collections import Counter
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.db.models import Count, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assistant import nvidia
from apps.assistant.services import customer_assistant, recommendation_reasons
from apps.core.permissions import IsCustomerUser
from apps.core.scheduling import earliest_changeable_date, refresh_manifests
from apps.deliveries.models import DailyDelivery
from apps.notifications.models import Notification
from apps.products.models import Product
from apps.quality.models import MilkBatch
from apps.quality.passport import passport_dict, passport_pdf
from apps.refunds.models import RefundClaim
from apps.subscriptions.models import Order, Subscription, VacationPeriod
from apps.wallet import services as wallet_services
from apps.wallet.models import PackagingEntry, Wallet, WalletTransaction
from apps.ops.billing import dues_status, ensure_within_limit
from . import services
from .common import customer_of, media_url, parse_bool, parse_date, parse_decimal, require
from .schedule import burn_rate, cutoff_info, project, product_brief


class CustomerView(APIView):
    permission_classes = [IsCustomerUser]

    def customer(self):
        c = customer_of(self.request)
        if c.dairy_id is None:
            raise ValidationError({'detail': 'Choose a dairy in your profile to start deliveries.'})
        return c


def wallet_dict(wallet: Wallet, customer) -> dict:
    return {
        'balance': wallet.balance, 'billing_mode': wallet.billing_mode,
        'auto_topup_enabled': wallet.auto_topup_enabled, 'auto_topup_threshold': wallet.auto_topup_threshold,
        'auto_topup_amount': wallet.auto_topup_amount, 'autopay_upi_id': wallet.autopay_upi_id,
        'autopay_status': wallet.autopay_status, 'autopay_max_daily': wallet.autopay_max_daily,
        'default_withdraw_upi': wallet.default_withdraw_upi,
        'burn': burn_rate(customer, wallet),
        'payments_enabled': settings.PAYMENTS_ENABLED,
    }


def txn_dict(t: WalletTransaction) -> dict:
    return {
        'id': str(t.id), 'kind': t.kind, 'kind_label': t.get_kind_display(), 'direction': t.direction,
        'channel': t.channel, 'amount': t.amount, 'balance_after': t.balance_after, 'description': t.description,
        'reference': t.reference, 'for_date': t.for_date.isoformat() if t.for_date else None,
        'created_at': timezone.localtime(t.created_at).isoformat(),
    }


def bottles_dict(customer) -> dict:
    with_you = wallet_services.bottles_with_customer(customer)
    deposit = Decimal(customer.dairy.bottle_deposit) if customer.dairy else Decimal('10')
    pouches = wallet_services.pouches_returned(customer)
    return {
        'with_you': with_you, 'deposit_each': deposit, 'deposit_held': deposit * with_you,
        'pouches_returned': pouches, 'pouches_to_next_credit': 10 - pouches % 10,
        'eco_credit_each': customer.dairy.pouch_eco_credit if customer.dairy else Decimal('5'),
    }


def doorstep_dict(c) -> dict:
    return {
        'silent_delivery': c.silent_delivery, 'use_gate_hook': c.use_gate_hook, 'photo_proof': c.photo_proof,
        'society_name': c.society_name, 'society_gate_pass': c.society_gate_pass,
        'delivery_instructions': c.delivery_instructions,
    }


class HomeView(CustomerView):
    """Everything the 6 AM home screen needs in one call."""

    def get(self, request):
        c = customer_of(request)
        today = timezone.localdate()
        if c.dairy_id is None:
            return Response({'needs_onboarding': True, 'customer_name': c.user.full_name})
        week = project(c, today, today + timedelta(days=6))
        wallet = wallet_services.get_wallet(c)
        tomorrow = week[1]
        today_plan = week[0]
        dairy = c.dairy
        claims = {str(r.delivery_id): r.status for r in RefundClaim.objects.filter(customer=c, delivery__delivery_date=today)}
        return Response({
            'needs_onboarding': False,
            'customer_name': c.user.full_name,
            'first_name': c.user.full_name.split(' ')[0],
            'dairy': {'id': str(dairy.id), 'name': dairy.business_name, 'phone': dairy.phone, 'hub_name': dairy.hub_name,
                      'slot': f"{dairy.slot_start.strftime('%I:%M %p').lstrip('0')} – {dairy.slot_end.strftime('%I:%M %p').lstrip('0')}"},
            'cutoff': cutoff_info(dairy),
            'today': {**today_plan.as_dict(request), 'refund_claims': claims},
            'tomorrow': tomorrow.as_dict(request),
            'week': [d.as_dict(request) for d in week],
            'wallet': wallet_dict(wallet, c),
            'bottles': bottles_dict(c),
            'doorstep': doorstep_dict(c),
            'gate_token': services.gate_token(c, today + timedelta(days=1)) if c.society_gate_pass else None,
            'vacations': [_vacation_dict(v) for v in VacationPeriod.objects.filter(customer=c, is_active=True, end_date__gte=today)],
            'unread_notifications': Notification.objects.filter(user=c.user, is_read=False).count(),
            'ai_engine': nvidia.engine_label('chat'),
            'payments_enabled': settings.PAYMENTS_ENABLED,
            'passport_enabled': settings.PASSPORT_ENABLED,
            'dues': dues_status(c, wallet),
        })


class WeekView(CustomerView):
    def get(self, request):
        c = self.customer()
        start = parse_date(request.query_params.get('start'), 'start', default=timezone.localdate())
        days = min(int(request.query_params.get('days', 7)), 42)
        return Response([d.as_dict(request) for d in project(c, start, start + timedelta(days=days - 1))])


class DayQuantityView(CustomerView):
    def post(self, request, day):
        c = self.customer()
        require(request.data, 'subscription_id')
        qty = parse_decimal(request.data.get('quantity'), 'quantity', Decimal('0'), services.MAX_QTY)
        services.set_day_quantity(c, parse_date(day), request.data['subscription_id'], qty)
        return Response(project(c, parse_date(day), parse_date(day))[0].as_dict(request))


class DaySkipView(CustomerView):
    def post(self, request, day):
        c = self.customer()
        d = parse_date(day)
        services.set_day_skipped(c, d, parse_bool(request.data.get('skip', True)))
        return Response(project(c, d, d)[0].as_dict(request))


class DaySwapView(CustomerView):
    def post(self, request, day):
        c = self.customer()
        require(request.data, 'subscription_id', 'product_id')
        d = parse_date(day)
        services.swap_variant(c, d, request.data['subscription_id'], request.data['product_id'])
        return Response(project(c, d, d)[0].as_dict(request))


class OrdersView(CustomerView):
    def get(self, request):
        c = self.customer()
        qs = Order.objects.filter(customer=c).select_related('product').order_by('-delivery_date', '-created_at')[:60]
        return Response([{
            'id': str(o.id), 'product': product_brief(o.product), 'quantity': o.quantity, 'amount': o.total_price,
            'date': o.delivery_date.isoformat(), 'status': o.status, 'is_express': o.is_express, 'source': o.source,
        } for o in qs])

    def post(self, request):
        c = self.customer()
        require(request.data, 'product_id')
        express = parse_bool(request.data.get('express', False))
        day = parse_date(request.data.get('date'), default=earliest_changeable_date(c.dairy))
        qty = parse_decimal(request.data.get('quantity', 1), 'quantity', Decimal('0.5'), services.MAX_QTY)
        o = services.add_order(c, request.data['product_id'], qty, day, source=request.data.get('source', 'shop')[:20],
                               express=express)
        return Response({'id': str(o.id), 'date': o.delivery_date.isoformat(), 'quantity': o.quantity,
                         'amount': o.total_price, 'is_express': o.is_express}, status=201)


class OrderCancelView(CustomerView):
    def post(self, request, pk):
        c = self.customer()
        o = Order.objects.filter(id=pk, customer=c).first()
        if o is None:
            raise NotFound('Order not found.')
        if o.status != Order.Status.PENDING:
            raise ValidationError({'detail': 'This order can no longer be cancelled.'})
        if not o.is_express:
            services.ensure_editable(c, o.delivery_date)
        o.status = Order.Status.CANCELLED
        o.save(update_fields=['status', 'updated_at'])
        return Response({'success': True})


def sub_dict(s: Subscription) -> dict:
    return {
        'id': str(s.id), 'product': product_brief(s.product), 'default_quantity': s.default_quantity,
        'status': s.status, 'start_date': s.start_date.isoformat(), 'end_date': s.end_date.isoformat() if s.end_date else None,
        'daily_amount': (s.default_quantity * s.product.price_per_unit).quantize(Decimal('0.01')),
        'time_slot': s.delivery_time_slot,
    }


class SubscriptionsView(CustomerView):
    def get(self, request):
        c = self.customer()
        subs = c.subscriptions.exclude(status=Subscription.Status.CANCELLED).select_related('product').order_by('created_at')
        return Response([sub_dict(s) for s in subs])

    @transaction.atomic
    def post(self, request):
        c = self.customer()
        require(request.data, 'product_id')
        product = Product.objects.filter(id=request.data['product_id'], dairy=c.dairy, is_available=True).first()
        if product is None:
            raise NotFound('Product not available.')
        if c.subscriptions.filter(product=product, status__in=('active', 'paused')).exists():
            raise ValidationError({'product_id': ['You already subscribe to this. Change its quantity instead.']})
        qty = parse_decimal(request.data.get('quantity', 1), 'quantity', Decimal('0.5'), services.MAX_QTY)
        ensure_within_limit(c)
        earliest = earliest_changeable_date(c.dairy)
        start = parse_date(request.data.get('start_date'), 'start_date', default=earliest)
        if start < earliest:
            raise ValidationError({'start_date': [f"The earliest start is {earliest.strftime('%d %b')}."]})
        s = Subscription.objects.create(customer=c, product=product, default_quantity=qty, start_date=start)
        refresh_manifests(c.dairy, [start])
        return Response(sub_dict(s), status=201)


class SubscriptionDetailView(CustomerView):
    @transaction.atomic
    def patch(self, request, pk):
        c = self.customer()
        s = c.subscriptions.filter(id=pk).exclude(status=Subscription.Status.CANCELLED).select_related('product').first()
        if s is None:
            raise NotFound('Subscription not found.')
        earliest = earliest_changeable_date(c.dairy)
        if 'default_quantity' in request.data:
            s.default_quantity = parse_decimal(request.data['default_quantity'], 'default_quantity', Decimal('0.5'), services.MAX_QTY)
        new_status = request.data.get('status')
        if new_status:
            if new_status not in Subscription.Status.values:
                raise ValidationError({'status': ['Unknown status.']})
            s.status = new_status
            if new_status == Subscription.Status.CANCELLED:
                s.end_date = earliest - timedelta(days=1)
        s.save()
        if s.status != Subscription.Status.ACTIVE:
            DailyDelivery.objects.filter(subscription=s, delivery_date__gte=earliest, status=DailyDelivery.Status.PENDING,
                                         status_updated_at__isnull=True).update(status=DailyDelivery.Status.SKIPPED,
                                                                                 scheduled_quantity=Decimal('0'))
        refresh_manifests(c.dairy, [earliest])
        return Response(sub_dict(s))


def _vacation_dict(v: VacationPeriod) -> dict:
    return {'id': str(v.id), 'start_date': v.start_date.isoformat(), 'end_date': v.end_date.isoformat(),
            'reason': v.reason, 'days': (v.end_date - v.start_date).days + 1}


class VacationPreviewView(CustomerView):
    def get(self, request):
        c = self.customer()
        p = request.query_params
        return Response(services.vacation_preview(c, parse_date(p.get('start_date'), 'start_date'),
                                                  parse_date(p.get('end_date'), 'end_date')))


class VacationsView(CustomerView):
    def get(self, request):
        c = self.customer()
        return Response([_vacation_dict(v) for v in VacationPeriod.objects.filter(customer=c, is_active=True)
                        .order_by('-start_date')[:20]])

    def post(self, request):
        c = self.customer()
        v = services.create_vacation(c, parse_date(request.data.get('start_date'), 'start_date'),
                                     parse_date(request.data.get('end_date'), 'end_date'), request.data.get('reason', ''))
        return Response(_vacation_dict(v), status=201)


class VacationDetailView(CustomerView):
    def delete(self, request, pk):
        c = self.customer()
        v = VacationPeriod.objects.filter(id=pk, customer=c, is_active=True).first()
        if v is None:
            raise NotFound('Vacation not found.')
        earliest = earliest_changeable_date(c.dairy)
        if v.end_date < earliest:
            raise ValidationError({'detail': 'This vacation is already over.'})
        affected = [v.start_date + timedelta(days=i) for i in range((v.end_date - v.start_date).days + 1)]
        if v.start_date < earliest:
            v.end_date = earliest - timedelta(days=1)  # end it early; days already locked stay paused
            v.save(update_fields=['end_date', 'updated_at'])
        else:
            v.is_active = False
            v.save(update_fields=['is_active', 'updated_at'])
        refresh_manifests(c.dairy, affected)
        return Response(status=204)


class ShopView(CustomerView):
    """Catalog with personalised sections: recommended (AI), top buys, buy again and new in."""

    def get(self, request):
        c = self.customer()
        products = list(Product.objects.filter(dairy=c.dairy, is_available=True))
        subscribed = set(c.subscriptions.filter(status__in=('active', 'paused')).values_list('product_id', flat=True))

        popularity = Counter()
        for pid, n in Order.objects.filter(dairy=c.dairy).exclude(status='cancelled').values_list('product_id') \
                .annotate(n=Count('id')):
            popularity[pid] += n
        for pid, n in Subscription.objects.filter(customer__dairy=c.dairy, status='active').values_list('product_id') \
                .annotate(n=Count('id')):
            popularity[pid] += n * 3

        mine = Counter(dict(Order.objects.filter(customer=c).exclude(status='cancelled')
                            .values_list('product_id').annotate(n=Count('id'))))
        last_order = {pid: d for pid, d in Order.objects.filter(customer=c).exclude(status='cancelled')
                      .values_list('product_id', 'delivery_date').order_by('delivery_date')}

        def card(p, **extra):
            return {**product_brief(p), 'description': p.description, 'is_new': p.is_new, 'is_featured': p.is_featured,
                    'kind': p.kind, 'fat_percent': p.fat_percent, 'subscribed': p.id in subscribed,
                    'popularity': popularity.get(p.id, 0), **extra}

        top = sorted(products, key=lambda p: -popularity.get(p.id, 0))[:8]
        reorder = sorted([p for p in products if p.id in mine], key=lambda p: last_order.get(p.id), reverse=True)[:8]
        fresh_cutoff = timezone.now() - timedelta(days=30)
        new_in = [p for p in products if p.is_new or p.created_at >= fresh_cutoff][:8]

        categories_owned = {p.category for p in products if p.id in subscribed or p.id in mine}
        complements = {'milk': ['curd', 'paneer', 'ghee', 'bakery'], 'curd': ['paneer', 'ghee'], 'bakery': ['eggs', 'ghee']}
        wanted = {cat for owned in categories_owned for cat in complements.get(owned, [])}
        scored = sorted(
            [p for p in products if p.id not in subscribed],
            key=lambda p: -(popularity.get(p.id, 0) + (6 if p.category in wanted else 0) + (3 if p.is_featured else 0)
                           + (2 if p.is_new else 0) - (4 if p.id in mine else 0)),
        )[:6]
        profile = {'subscribes_to': [p.name for p in products if p.id in subscribed],
                   'often_orders': [p.name for p in reorder[:4]]}
        reasons, engine, pending = recommendation_reasons(
            str(c.id), profile,
            [{'id': str(p.id), 'name': p.name, 'category': p.category, 'price': float(p.price_per_unit), 'unit': p.unit}
             for p in scored])

        return Response({
            'editable_from': earliest_changeable_date(c.dairy).isoformat(),
            'recommended': {'engine': engine, 'pending': pending, 'items': [card(p, reason=reasons.get(str(p.id))) for p in scored]},
            'top_buys': [card(p) for p in top],
            'reorder': [card(p, times_ordered=mine[p.id], last_ordered=last_order[p.id].isoformat()) for p in reorder],
            'new_in': [card(p) for p in new_in],
            'all': [card(p) for p in sorted(products, key=lambda p: (p.category, p.name))],
            'categories': [{'id': k, 'label': v} for k, v in Product.Category.choices if any(p.category == k for p in products)],
        })


class WalletView(CustomerView):
    def get(self, request):
        c = self.customer()
        wallet = wallet_services.get_wallet(c)
        qs = wallet.transactions.all()
        kind = request.query_params.get('kind')
        if kind == 'credits':
            qs = qs.filter(direction='credit')
        elif kind == 'debits':
            qs = qs.filter(direction='debit')
        month_start = timezone.localdate().replace(day=1)
        month = wallet.transactions.filter(created_at__date__gte=month_start)
        spent = sum((t.amount for t in month if t.direction == 'debit' and t.kind != 'withdrawal'), Decimal('0'))
        saved = sum((t.amount for t in month if t.kind in ('refund', 'eco_credit', 'bottle_return')), Decimal('0'))
        return Response({**wallet_dict(wallet, c), 'month_spent': spent, 'month_credits': saved,
                         'transactions': [txn_dict(t) for t in qs[:80]]})

    def patch(self, request):
        wallet_services.require_payments()
        c = self.customer()
        w = wallet_services.get_wallet(c)
        d = request.data
        if 'auto_topup_enabled' in d:
            w.auto_topup_enabled = parse_bool(d['auto_topup_enabled'])
        if 'auto_topup_threshold' in d:
            w.auto_topup_threshold = parse_decimal(d['auto_topup_threshold'], 'auto_topup_threshold', Decimal('0'), Decimal('5000'))
        if 'auto_topup_amount' in d:
            w.auto_topup_amount = parse_decimal(d['auto_topup_amount'], 'auto_topup_amount', Decimal('100'), Decimal('10000'))
        if 'autopay_upi_id' in d:
            upi = str(d['autopay_upi_id']).strip()
            if upi and '@' not in upi:
                raise ValidationError({'autopay_upi_id': ['Enter a valid UPI ID, e.g. name@okicici.']})
            w.autopay_upi_id = upi
        if 'billing_mode' in d:
            if d['billing_mode'] not in Wallet.BillingMode.values:
                raise ValidationError({'billing_mode': ['Unknown billing mode.']})
            if d['billing_mode'] == Wallet.BillingMode.AUTOPAY:
                if not w.autopay_upi_id:
                    raise ValidationError({'autopay_upi_id': ['Add the UPI ID to set up the Autopay mandate.']})
                w.autopay_status = Wallet.MandateStatus.ACTIVE
            w.billing_mode = d['billing_mode']
        if 'autopay_status' in d and d['autopay_status'] in Wallet.MandateStatus.values:
            w.autopay_status = d['autopay_status']
            if w.autopay_status != Wallet.MandateStatus.ACTIVE:
                w.billing_mode = Wallet.BillingMode.WALLET
        w.save()
        return Response(wallet_dict(w, c))


class WalletTopupView(CustomerView):
    def post(self, request):
        wallet_services.require_payments()
        c = self.customer()
        amount = parse_decimal(request.data.get('amount'), 'amount')
        t = wallet_services.topup(c, amount, str(request.data.get('upi_id', '')).strip())
        return Response({'transaction': txn_dict(t), 'wallet': wallet_dict(wallet_services.get_wallet(c), c)}, status=201)


class WalletWithdrawView(CustomerView):
    def post(self, request):
        wallet_services.require_payments()
        c = self.customer()
        amount = parse_decimal(request.data.get('amount'), 'amount', required=False)
        t = wallet_services.withdraw(c, amount, request.data.get('destination', ''))
        return Response({'transaction': txn_dict(t), 'wallet': wallet_dict(wallet_services.get_wallet(c), c)}, status=201)


class BottlesView(CustomerView):
    def get(self, request):
        c = self.customer()
        entries = PackagingEntry.objects.filter(customer=c).select_related('recorded_by')[:60]
        return Response({**bottles_dict(c), 'entries': [{
            'id': str(e.id), 'kind': e.kind, 'label': e.get_kind_display(), 'count': e.count, 'date': e.date.isoformat(),
            'recorded_by': e.recorded_by.full_name if e.recorded_by else None,
        } for e in entries]})


class PassportView(CustomerView):
    def get(self, request):
        if not settings.PASSPORT_ENABLED:
            raise NotFound('The purity passport is not available yet.')
        c = self.customer()
        p = request.query_params
        qs = DailyDelivery.objects.filter(subscription__customer=c).select_related('subscription__product', 'batch')
        if p.get('delivery_id'):
            delivery = qs.filter(id=p['delivery_id']).first()
        else:
            day = parse_date(p.get('date'), default=timezone.localdate())
            delivery = qs.filter(delivery_date__lte=day, subscription__product__category='milk') \
                .exclude(status='skipped').order_by('-delivery_date').first()
        batch = services.batch_for_delivery(delivery) if delivery else None
        if batch is None:
            batch = MilkBatch.objects.filter(dairy=c.dairy, status='passed').order_by('-delivery_date').first()
        if batch is None:
            raise NotFound('No certified batch is available yet.')
        return Response({**passport_dict(batch), 'product_name': delivery.subscription.product.name if delivery else None,
                         'delivery_date': delivery.delivery_date.isoformat() if delivery else batch.delivery_date.isoformat()})


class PassportPdfView(APIView):
    """Customers download their dairy's certificates; dairies download their own."""

    def get(self, request, pk):
        user = request.user
        if not settings.PASSPORT_ENABLED and user.role != 'dairy':
            raise NotFound('Certificates are not available yet.')
        qs = MilkBatch.objects.select_related('dairy')
        if user.role == 'customer':
            qs = qs.filter(dairy=customer_of(request).dairy)
        elif user.role == 'dairy':
            qs = qs.filter(dairy__user=user)
        elif user.role == 'delivery_boy':
            qs = qs.filter(dairy=getattr(getattr(user, 'delivery_profile', None), 'dairy', None))
        batch = qs.filter(id=pk).first()
        if batch is None:
            raise NotFound('Certificate not found.')
        pdf = passport_pdf(batch, user.full_name if user.role == 'customer' else None)
        resp = HttpResponse(pdf, content_type='application/pdf')
        resp['Content-Disposition'] = f'attachment; filename="purity-passport-{batch.code}.pdf"'
        return resp


def claim_dict(request, r: RefundClaim) -> dict:
    return {
        'id': str(r.id), 'issue': r.issue, 'issue_label': r.get_issue_display(), 'amount': r.amount, 'status': r.status,
        'ai_verdict': r.ai_verdict, 'ai_confidence': r.ai_confidence, 'ai_observation': r.ai_observation,
        'ai_engine': r.ai_engine, 'processing_ms': r.processing_ms, 'photo': media_url(request, r.photo),
        'delivery_id': str(r.delivery_id), 'delivery_date': r.delivery.delivery_date.isoformat(),
        'product_name': r.delivery.subscription.product.name, 'customer_name': r.customer.user.full_name,
        'reviewed_note': r.reviewed_note, 'created_at': timezone.localtime(r.created_at).isoformat(),
        'backup_order_id': str(r.backup_order_id) if r.backup_order_id else None,
    }


class RefundsView(CustomerView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_throttles(self):
        if self.request.method == 'POST':
            self.throttle_scope = 'refund'
        return super().get_throttles()

    def get(self, request):
        c = self.customer()
        qs = RefundClaim.objects.filter(customer=c).select_related('delivery__subscription__product', 'customer__user')[:30]
        return Response([claim_dict(request, r) for r in qs])

    def post(self, request):
        c = self.customer()
        require(request.data, 'delivery_id', 'issue')
        claim = services.file_refund(c, request.data['delivery_id'], request.data['issue'], request.FILES.get('photo'))
        wallet = wallet_services.get_wallet(c)
        return Response({'claim': claim_dict(request, claim), 'wallet_balance': wallet.balance}, status=201)


class RefundBackupView(CustomerView):
    """Emergency backup: 15-minute express delivery of the same milk from the nearest dark hub."""

    def post(self, request, pk):
        c = self.customer()
        claim = RefundClaim.objects.filter(id=pk, customer=c).select_related('delivery__subscription__product').first()
        if claim is None:
            raise NotFound('Claim not found.')
        if claim.backup_order_id:
            raise ValidationError({'detail': 'A backup delivery is already on its way.'})
        product_id = request.data.get('product_id') or claim.delivery.subscription.product_id
        qty = parse_decimal(request.data.get('quantity', claim.delivery.delivered_quantity or 1), 'quantity',
                            Decimal('0.5'), services.MAX_QTY)
        order = services.add_order(c, product_id, qty, timezone.localdate(), source='backup', express=True)
        claim.backup_order = order
        claim.save(update_fields=['backup_order', 'updated_at'])
        eta = timezone.localtime() + timedelta(minutes=15)
        return Response({'order_id': str(order.id), 'eta': eta.isoformat(),
                         'eta_label': eta.strftime('%I:%M %p').lstrip('0'), 'amount': order.total_price}, status=201)


class ProfileView(CustomerView):
    FIELDS = ('address', 'flat_or_house_number', 'landmark', 'delivery_instructions', 'society_name',
              'preferred_language')
    FLAGS = ('silent_delivery', 'use_gate_hook', 'photo_proof', 'society_gate_pass')

    def data(self, c):
        return {
            'full_name': c.user.full_name, 'email': c.user.email, 'phone': c.user.phone,
            'dairy_id': str(c.dairy_id) if c.dairy_id else None, 'dairy_name': c.dairy.business_name if c.dairy else None,
            'route_name': c.delivery_route.name if c.delivery_route else None,
            **{f: getattr(c, f) for f in self.FIELDS}, **doorstep_dict(c),
        }

    def get(self, request):
        return Response(self.data(customer_of(request)))

    def patch(self, request):
        c = customer_of(request)
        d = request.data
        for f in self.FIELDS:
            if f in d:
                setattr(c, f, str(d[f]).strip()[:500])
        if 'address' in d and not c.address:
            raise ValidationError({'address': ['Address cannot be empty.']})
        for f in self.FLAGS:
            if f in d:
                setattr(c, f, parse_bool(d[f]))
        if 'dairy_id' in d and str(d['dairy_id']) != str(c.dairy_id):
            from apps.dairies.models import Dairy
            if c.subscriptions.filter(status__in=('active', 'paused')).exists():
                raise ValidationError({'dairy_id': ['Cancel your subscriptions before switching dairy.']})
            dairy = Dairy.objects.filter(id=d['dairy_id'], is_active=True).first()
            if dairy is None:
                raise ValidationError({'dairy_id': ['Dairy not found.']})
            c.dairy, c.delivery_route = dairy, None
        c.save()
        u = c.user
        if d.get('full_name', '').strip():
            u.full_name = d['full_name'].strip()[:255]
        if 'phone' in d and d['phone'] != u.phone:
            from apps.accounts.models import User
            if User.all_objects.filter(phone=d['phone']).exclude(pk=u.pk).exists():
                raise ValidationError({'phone': ['This phone number is already in use.']})
            u.phone = d['phone'] or None
        u.save()
        return Response(self.data(c))


def _assistant_context(c) -> dict:
    today = timezone.localdate()
    week = project(c, today + timedelta(days=1), today + timedelta(days=7))
    wallet = wallet_services.get_wallet(c)
    burn = burn_rate(c, wallet)
    cut = cutoff_info(c.dairy)
    return {
        'today': today.isoformat(), 'weekday': today.strftime('%A'),
        'editable_from': cut['governs_date'], 'cutoff_label': cut['cutoff_label'],
        'subscriptions': [{'subscription_id': str(s.id), 'name': s.product.name, 'unit': s.product.unit,
                           'default_quantity': float(s.default_quantity), 'step': float(s.product.quantity_step),
                           'status': s.status}
                          for s in c.subscriptions.filter(status__in=('active', 'paused')).select_related('product')],
        'next_7_days': [{'date': d.date.isoformat(), 'status': d.status, 'amount': float(d.amount),
                         'items': [f"{i['product']['name']} × {float(i['quantity']):g}" for i in d.items if i['quantity']]
                         + [f"{o['product']['name']} × {float(o['quantity']):g} (add-on)" for o in d.orders]}
                        for d in week],
        'wallet': {'balance': float(wallet.balance), 'mode': wallet.billing_mode, 'covers_until': burn['covers_until']},
        'bottles_with_you': wallet_services.bottles_with_customer(c),
        'catalog': [{'id': str(p.id), 'name': p.name, 'price': float(p.price_per_unit), 'unit': p.unit}
                    for p in Product.objects.filter(dairy=c.dairy, is_available=True)],
    }


class AssistantView(CustomerView):
    throttle_scope = 'ai'

    def post(self, request):
        c = self.customer()
        messages = request.data.get('messages')
        if not isinstance(messages, list) or not messages:
            raise ValidationError({'messages': ['Send the conversation as a list of messages.']})
        return Response(customer_assistant(_assistant_context(c), messages))


class AssistantApplyView(CustomerView):
    """Executes an action the assistant proposed, after the customer tapped to confirm it."""

    def post(self, request):
        c = self.customer()
        a = request.data.get('action') or {}
        kind = a.get('type')
        if kind == 'skip_day':
            services.set_day_skipped(c, parse_date(a.get('date')), True)
            msg = 'Skipped. You can undo this until the cutoff.'
        elif kind == 'unskip_day':
            services.set_day_skipped(c, parse_date(a.get('date')), False)
            msg = 'Delivery restored.'
        elif kind == 'set_quantity':
            services.set_day_quantity(c, parse_date(a.get('date')), a.get('subscription_id'),
                                      parse_decimal(a.get('quantity'), 'quantity', Decimal('0'), services.MAX_QTY))
            msg = 'Quantity updated.'
        elif kind == 'add_order':
            services.add_order(c, a.get('product_id'), parse_decimal(a.get('quantity', 1), 'quantity', Decimal('0.5'),
                                                                     services.MAX_QTY), parse_date(a.get('date')), source='assistant')
            msg = 'Added to your delivery.'
        elif kind == 'vacation':
            v = services.create_vacation(c, parse_date(a.get('start_date'), 'start_date'), parse_date(a.get('end_date'), 'end_date'))
            msg = f"Vacation saved. Deliveries resume on {(v.end_date + timedelta(days=1)).strftime('%a %d %b')}."
        else:
            raise ValidationError({'action': ['Unknown action.']})
        return Response({'success': True, 'message': msg})
