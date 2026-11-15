from datetime import datetime, timedelta

from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsDairyUser, IsDeliveryBoyUser, IsDeliveryOrDairyOrAdmin
from .models import DailyDelivery, DeliveryBoy
from .serializers import (
    DailyDeliverySerializer,
    DeliveryBoySerializer,
    DeliveryBoyUpdateSerializer,
    DeliveryStatusUpdateSerializer,
    DeliverySyncSerializer,
)
from .services import (
    DeliveryUpdate,
    DeliveryUpdateError,
    apply_delivery_update,
    deliveries_visible_to,
    generate_daily_deliveries,
    parse_quantity,
)


def _parse_date(value):
    if not value:
        return timezone.localdate()
    try:
        return datetime.strptime(value, '%Y-%m-%d').date()
    except ValueError:
        return None


class TodayDeliveriesListView(generics.ListAPIView):
    """Dairy's delivery manifest for a day (route-ordered). Defaults to today."""
    serializer_class = DailyDeliverySerializer
    permission_classes = [IsDairyUser]
    pagination_class = None

    def list(self, request, *args, **kwargs):
        target_date = _parse_date(request.query_params.get('date'))
        if target_date is None:
            return Response({'detail': 'date must be YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
        # Manifests only exist up to tomorrow; past days are read-only history.
        if target_date >= timezone.localdate() and target_date <= timezone.localdate() + timedelta(days=1):
            generate_daily_deliveries(target_date, dairy=request.user.dairy)

        qs = deliveries_visible_to(request.user).filter(delivery_date=target_date).order_by(
            'subscription__customer__route_stop_order', 'subscription__customer__user__full_name'
        )
        route_id = request.query_params.get('route_id')
        if route_id:
            qs = qs.filter(subscription__customer__delivery_route_id=route_id)
        status_param = request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        rows = list(qs)
        summary = {
            'total': len(rows),
            'delivered': sum(1 for d in rows if d.status == DailyDelivery.Status.DELIVERED),
            'pending': sum(1 for d in rows if d.status == DailyDelivery.Status.PENDING),
            'skipped': sum(1 for d in rows if d.status == DailyDelivery.Status.SKIPPED),
            'missed': sum(1 for d in rows if d.status == DailyDelivery.Status.MISSED),
            'scheduled_litres': float(sum(d.scheduled_quantity for d in rows)),
            'delivered_litres': float(sum(d.delivered_quantity for d in rows if d.status == DailyDelivery.Status.DELIVERED)),
        }
        return Response({
            'date': target_date.isoformat(),
            'summary': summary,
            'deliveries': DailyDeliverySerializer(rows, many=True).data,
        })


class UpdateDeliveryStatusView(APIView):
    """Mark one delivery delivered / skipped / missed / pending, with optional quantity."""
    permission_classes = [IsDeliveryOrDairyOrAdmin]

    @extend_schema(request=DeliveryStatusUpdateSerializer, responses={200: DailyDeliverySerializer})
    def patch(self, request, pk):
        delivery = deliveries_visible_to(request.user).filter(id=pk).first()
        if not delivery:
            return Response({'detail': 'Delivery not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DeliveryStatusUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            delivery, applied = apply_delivery_update(delivery, request.user, DeliveryUpdate(
                status=data.get('status'),
                delivered_quantity=parse_quantity(data.get('delivered_quantity')),
                notes=data.get('notes'),
                client_updated_at=data.get('client_updated_at'),
            ))
        except DeliveryUpdateError as exc:
            return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)

        return Response({
            'success': True,
            'applied': applied,
            'message': f'Delivery marked as {delivery.status}' if applied else 'A newer change already exists.',
            'delivery': DailyDeliverySerializer(delivery).data,
        })


class DeliverySyncView(APIView):
    """
    Batch upload of delivery changes recorded offline.

    Each item is applied independently and gets its own result, so one bad
    item never blocks the rest of the queue.
    """
    permission_classes = [IsDeliveryOrDairyOrAdmin]

    @extend_schema(request=DeliverySyncSerializer)
    def post(self, request):
        serializer = DeliverySyncSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        visible = deliveries_visible_to(request.user)
        items = serializer.validated_data['updates']
        deliveries = {d.id: d for d in visible.filter(id__in=[i['id'] for i in items])}

        results = []
        for item in sorted(items, key=lambda i: i['client_updated_at']):
            delivery = deliveries.get(item['id'])
            if delivery is None:
                results.append({'id': str(item['id']), 'result': 'rejected', 'detail': 'Delivery not found.'})
                continue
            try:
                updated, applied = apply_delivery_update(delivery, request.user, DeliveryUpdate(
                    status=item.get('status'),
                    delivered_quantity=parse_quantity(item.get('delivered_quantity')),
                    notes=item.get('notes'),
                    client_updated_at=item['client_updated_at'],
                ))
                deliveries[updated.id] = updated
                results.append({
                    'id': str(updated.id),
                    'result': 'applied' if applied else 'superseded',
                    'delivery': DailyDeliverySerializer(updated).data,
                })
            except DeliveryUpdateError as exc:
                results.append({'id': str(item['id']), 'result': 'rejected', 'detail': exc.message, 'code': exc.code})

        return Response({'results': results})


class DeliveryBoyListView(generics.ListAPIView):
    """A dairy's gawalis. Accounts are created by the platform admin, not here."""
    serializer_class = DeliveryBoySerializer
    permission_classes = [IsDairyUser]
    pagination_class = None

    def get_queryset(self):
        return DeliveryBoy.objects.filter(
            dairy=self.request.user.dairy, user__is_deleted=False
        ).select_related('user', 'assigned_route')


class DeliveryBoyDetailView(generics.RetrieveUpdateAPIView):
    """Dairy assigns a gawali to a route or updates their vehicle."""
    permission_classes = [IsDairyUser]
    http_method_names = ['get', 'patch']

    def get_queryset(self):
        return DeliveryBoy.objects.filter(dairy=self.request.user.dairy).select_related('user', 'assigned_route')

    def get_serializer_class(self):
        return DeliveryBoyUpdateSerializer if self.request.method == 'PATCH' else DeliveryBoySerializer

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = DeliveryBoyUpdateSerializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        instance.refresh_from_db()
        return Response(DeliveryBoySerializer(instance).data)


class DeliveryBoyRouteView(APIView):
    """A gawali's stops for today, in route order."""
    permission_classes = [IsDeliveryBoyUser]

    def get(self, request):
        profile = getattr(request.user, 'delivery_profile', None)
        if profile is None:
            return Response({'detail': 'No delivery profile is linked to this account.'}, status=status.HTTP_404_NOT_FOUND)

        today = timezone.localdate()
        generate_daily_deliveries(today, dairy=profile.dairy)
        stops = list(
            deliveries_visible_to(request.user)
            .filter(delivery_date=today)
            .order_by('subscription__customer__route_stop_order', 'subscription__customer__user__full_name')
        )
        delivered = sum(1 for d in stops if d.status == DailyDelivery.Status.DELIVERED)
        pending = sum(1 for d in stops if d.status == DailyDelivery.Status.PENDING)

        return Response({
            'date': today.isoformat(),
            'dairy_name': profile.dairy.business_name,
            'route_name': profile.assigned_route.name if profile.assigned_route else None,
            'progress': {'delivered': delivered, 'pending': pending, 'total': len(stops)},
            'stops': DailyDeliverySerializer(stops, many=True).data,
        })
