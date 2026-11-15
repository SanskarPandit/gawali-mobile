from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assistant.services import route_brief
from apps.core.permissions import IsDeliveryBoyUser
from apps.customers.models import CustomerProfile
from apps.deliveries.models import DailyDelivery
from apps.deliveries.services import DeliveryUpdate, apply_delivery_update
from apps.notifications.models import Notification
from apps.wallet.models import PackagingEntry
from . import services
from .common import parse_date, partner_of
from .views_dairy import build_stops, load_sheet


class PartnerView(APIView):
    permission_classes = [IsDeliveryBoyUser]

    @property
    def partner(self):
        return partner_of(self.request)

    def stops(self, day):
        p = self.partner
        route = str(p.assigned_route_id) if p.assigned_route_id else None
        return [s for s in build_stops(self.request, p.dairy, day, route) if s['status'] != 'skipped']

    def customer(self, pk):
        p = self.partner
        qs = CustomerProfile.objects.filter(id=pk, dairy=p.dairy)
        if p.assigned_route_id:
            qs = qs.filter(delivery_route_id=p.assigned_route_id)
        c = qs.select_related('user', 'dairy').first()
        if c is None:
            raise NotFound('This household is not on your route.')
        return c


class RouteView(PartnerView):
    def get(self, request):
        p = self.partner
        today = timezone.localdate()
        day = parse_date(request.query_params.get('date'), default=today)
        if day > today + timedelta(days=1):
            raise ValidationError({'date': ['You can preview up to tomorrow.']})
        stops = self.stops(day)
        done = sum(1 for s in stops if s['status'] == 'delivered')
        dairy = p.dairy
        return Response({
            'date': day.isoformat(), 'is_today': day == today,
            'partner': {'name': p.user.full_name, 'vehicle_number': p.vehicle_number,
                        'route_name': p.assigned_route.name if p.assigned_route else 'All households'},
            'dairy': {'name': dairy.business_name, 'phone': dairy.phone, 'hub_name': dairy.hub_name,
                      'slot': f"{dairy.slot_start.strftime('%I:%M %p').lstrip('0')} – {dairy.slot_end.strftime('%I:%M %p').lstrip('0')}"},
            'progress': {'total': len(stops), 'delivered': done,
                         'missed': sum(1 for s in stops if s['status'] == 'missed'),
                         'pending': sum(1 for s in stops if s['status'] in ('pending', 'partial'))},
            'stops': stops, 'load_sheet': load_sheet(stops),
        })


class BriefView(PartnerView):
    def get(self, request):
        p = self.partner
        stops = self.stops(timezone.localdate())
        sheet = load_sheet(stops)
        litres = Decimal('0')
        from .views_dairy import unit_litres
        for e in sheet:
            litres += e['quantity'] * (unit_litres(e['product']['unit']) or Decimal('0'))
        summary = {
            'partner': p.user.full_name.split(' ')[0], 'stops': len(stops), 'litres': float(litres),
            'silent': sum(1 for s in stops if s['doorstep']['silent_delivery']),
            'gate_hooks': sum(1 for s in stops if s['doorstep']['use_gate_hook']),
            'photo_required': sum(1 for s in stops if s['doorstep']['photo_proof']),
            'gate_passes': sum(1 for s in stops if s['gate_token']),
            'bottles_to_collect': sum(s['bottles_with_customer'] for s in stops),
            'express': sum(1 for s in stops if s['is_express']),
            'load': [f"{float(e['quantity']):g} × {e['product']['name']} ({e['product']['unit']})" for e in sheet],
        }
        return Response(route_brief(str(p.id), summary))


class CompleteStopView(PartnerView):
    throttle_scope = 'upload'

    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request, pk):
        c = self.customer(pk)
        d = request.data
        try:
            bottles = int(d.get('bottles_returned') or 0)
            pouches = int(d.get('pouches_returned') or 0)
        except ValueError:
            raise ValidationError({'bottles_returned': ['Enter whole numbers.']})
        if bottles < 0 or pouches < 0 or bottles > 50 or pouches > 200:
            raise ValidationError({'bottles_returned': ['That count looks too high.']})
        result = services.complete_stop(
            c, timezone.localdate(), request.user, outcome=d.get('outcome', 'delivered'),
            bottles_returned=bottles, pouches=pouches, photo=request.FILES.get('photo'), note=d.get('note', ''),
        )
        return Response(result)


class ReopenStopView(PartnerView):
    """Undo a "missed" mark (e.g. the customer opened the door after all)."""

    def post(self, request, pk):
        c = self.customer(pk)
        rows = services.stop_rows(c, timezone.localdate()).filter(status=DailyDelivery.Status.MISSED)
        if not rows:
            raise ValidationError({'detail': 'Only missed stops can be reopened.'})
        for r in rows:
            apply_delivery_update(r, request.user, DeliveryUpdate(status=DailyDelivery.Status.PENDING))
        return Response({'success': True})


class HistoryView(PartnerView):
    def get(self, request):
        p = self.partner
        today = timezone.localdate()
        start = today - timedelta(days=13)
        rows = DailyDelivery.objects.filter(delivered_by=p.user, delivery_date__range=(start, today)) \
            .values('delivery_date').annotate(
                drops=Count('subscription__customer', filter=Q(status='delivered'), distinct=True),
                missed=Count('subscription__customer', filter=Q(status='missed'), distinct=True))
        by_day = {r['delivery_date']: r for r in rows}
        bottles = {r['date']: r['n'] for r in PackagingEntry.objects.filter(recorded_by=p.user, kind='bottle_returned',
                                                                           date__range=(start, today))
                   .values('date').annotate(n=Count('id'))}
        days = [{'date': (start + timedelta(days=i)).isoformat(),
                 'drops': by_day.get(start + timedelta(days=i), {}).get('drops', 0),
                 'missed': by_day.get(start + timedelta(days=i), {}).get('missed', 0),
                 'bottle_pickups': bottles.get(start + timedelta(days=i), 0)} for i in range(14)]
        return Response({
            'days': days,
            'totals': {'drops': sum(d['drops'] for d in days), 'missed': sum(d['missed'] for d in days),
                       'on_time_rate': round(100 * sum(d['drops'] for d in days) /
                                             max(1, sum(d['drops'] + d['missed'] for d in days)), 1)},
            'notifications': [{'title': n.title, 'body': n.body, 'created_at': timezone.localtime(n.created_at).isoformat()}
                              for n in Notification.objects.filter(user=p.user)[:10]],
        })


class PartnerProfileView(PartnerView):
    def get(self, request):
        p = self.partner
        return Response({'name': p.user.full_name, 'email': p.user.email, 'phone': p.user.phone,
                         'vehicle_number': p.vehicle_number, 'dairy_name': p.dairy.business_name,
                         'route_name': p.assigned_route.name if p.assigned_route else None})

    def patch(self, request):
        p = self.partner
        if 'vehicle_number' in request.data:
            p.vehicle_number = str(request.data['vehicle_number']).strip()[:50]
            p.save(update_fields=['vehicle_number', 'updated_at'])
        if str(request.data.get('full_name', '')).strip():
            p.user.full_name = request.data['full_name'].strip()[:255]
            p.user.save(update_fields=['full_name'])
        return self.get(request)
