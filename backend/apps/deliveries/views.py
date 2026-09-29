from rest_framework import generics, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime, date, timedelta
from apps.core.permissions import IsDairyUser, IsDeliveryBoyUser, IsDeliveryOrDairyOrAdmin
from apps.accounts.models import User
from .models import DailyDelivery, DeliveryBoy
from .serializers import (
    DailyDeliverySerializer,
    DeliveryBoySerializer,
    CreateDeliveryBoySerializer,
)

class TodayDeliveriesListView(generics.ListAPIView):
    """Dairy vendor's daily delivery manifest (route-ordered)."""
    serializer_class = DailyDeliverySerializer
    permission_classes = [IsDairyUser]

    def get_queryset(self):
        dairy = self.request.user.dairy
        date_param = self.request.query_params.get('date')
        if date_param:
            try:
                target_date = datetime.strptime(date_param, '%Y-%m-%d').date()
            except ValueError:
                target_date = timezone.localdate()
        else:
            target_date = timezone.localdate()

        # Ensure records are generated for this date
        from .tasks import generate_daily_deliveries_for_date
        generate_daily_deliveries_for_date(target_date)

        qs = DailyDelivery.objects.filter(
            subscription__customer__dairy=dairy,
            delivery_date=target_date
        ).select_related(
            'subscription__customer__user',
            'subscription__product',
            'subscription__customer__delivery_route'
        ).order_by('subscription__customer__route_stop_order', 'subscription__customer__user__full_name')

        route_id = self.request.query_params.get('route_id')
        if route_id:
            qs = qs.filter(subscription__customer__delivery_route_id=route_id)

        status_param = self.request.query_params.get('status')
        if status_param and status_param != 'all':
            qs = qs.filter(status=status_param)

        return qs

class UpdateDeliveryStatusView(APIView):
    """Mark a delivery as delivered, missed, or skipped with quick quantity adjustment."""
    permission_classes = [IsDeliveryOrDairyOrAdmin]

    def patch(self, request, pk):
        delivery = DailyDelivery.objects.filter(id=pk).first()
        if not delivery:
            return Response({'detail': 'Delivery record not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        delivered_qty = request.data.get('delivered_quantity')
        notes = request.data.get('notes')

        if new_status:
            delivery.status = new_status
            if new_status == 'delivered':
                delivery.delivered_at = timezone.now()
                delivery.delivered_by = request.user
                if delivered_qty is None:
                    # Default delivered qty to scheduled
                    delivery.delivered_quantity = delivery.scheduled_quantity
            elif new_status in ['skipped', 'missed']:
                delivery.delivered_quantity = 0.0

        if delivered_qty is not None:
            delivery.delivered_quantity = float(delivered_qty)

        if notes is not None:
            delivery.notes = notes

        delivery.save()

        return Response({
            'success': True,
            'message': f"Delivery marked as {delivery.status}",
            'delivery': DailyDeliverySerializer(delivery).data
        })

class DeliveryBoyListView(generics.ListCreateAPIView):
    """Vendor lists and adds delivery staff."""
    permission_classes = [IsDairyUser]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return CreateDeliveryBoySerializer
        return DeliveryBoySerializer

    def get_queryset(self):
        return DeliveryBoy.objects.filter(dairy=self.request.user.dairy, is_active=True).select_related('user', 'assigned_route')

    def create(self, request, *args, **kwargs):
        serializer = CreateDeliveryBoySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        dairy = request.user.dairy
        # Create user with delivery_boy role
        user = User.objects.create_user(
            email=data['email'].lower(),
            password=data['password'],
            full_name=data['full_name'],
            phone=data['phone'],
            role=User.Role.DELIVERY_BOY,
            is_phone_verified=True
        )

        delivery_boy = DeliveryBoy.objects.create(
            user=user,
            dairy=dairy,
            vehicle_number=data.get('vehicle_number', ''),
            assigned_route_id=data.get('assigned_route_id')
        )

        return Response({
            'success': True,
            'message': 'Delivery boy created successfully',
            'delivery_boy': DeliveryBoySerializer(delivery_boy).data
        }, status=status.HTTP_201_CREATED)

class DeliveryBoyRouteView(APIView):
    """Delivery boy's daily route screen (/d) showing stops in order with GPS and toggle."""
    permission_classes = [IsDeliveryBoyUser]

    def get(self, request):
        user = request.user
        profile = user.delivery_profile
        today = timezone.localdate()

        # Generate deliveries if not yet created
        from .tasks import generate_daily_deliveries_for_date
        generate_daily_deliveries_for_date(today)

        deliveries = DailyDelivery.objects.filter(
            delivery_date=today
        )
        if profile.assigned_route:
            deliveries = deliveries.filter(subscription__customer__delivery_route=profile.assigned_route)
        else:
            deliveries = deliveries.filter(subscription__customer__dairy=profile.dairy)

        deliveries = deliveries.select_related(
            'subscription__customer__user',
            'subscription__product'
        ).order_by('subscription__customer__route_stop_order')

        delivered_count = deliveries.filter(status='delivered').count()
        total_count = deliveries.count()

        return Response({
            'date': today.isoformat(),
            'route_name': profile.assigned_route.name if profile.assigned_route else 'General Route',
            'progress': {
                'delivered': delivered_count,
                'total': total_count,
                'pending': total_count - delivered_count
            },
            'stops': DailyDeliverySerializer(deliveries, many=True).data
        })
