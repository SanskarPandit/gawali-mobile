from rest_framework import generics, viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime, date, timedelta
import calendar
from apps.core.permissions import IsCustomerUser, IsDairyUser, IsDairyOrAdmin
from apps.deliveries.models import DailyDelivery
from .models import Subscription, DeliveryOverride, VacationPeriod, Order
from .serializers import (
    SubscriptionSerializer,
    DeliveryOverrideSerializer,
    VacationPeriodSerializer,
    OrderSerializer,
)

class SubscriptionDetailView(APIView):
    """Customer gets or updates their active daily milk plan."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        profile = request.user.customer_profile
        sub = Subscription.objects.filter(customer=profile, status='active').first()
        if not sub:
            return Response({'subscription': None})
        return Response({'subscription': SubscriptionSerializer(sub).data})

    def patch(self, request):
        profile = request.user.customer_profile
        sub = Subscription.objects.filter(customer=profile, status='active').first()
        if not sub:
            return Response({'detail': 'No active subscription found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = SubscriptionSerializer(sub, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({
            'success': True,
            'message': 'Subscription updated successfully',
            'subscription': serializer.data
        })

class CalendarMonthView(APIView):
    """Returns the full calendar grid for a given year & month with deliveries, overrides, and vacations."""
    permission_classes = [IsCustomerUser]

    def get(self, request):
        profile = request.user.customer_profile
        now = timezone.localtime()
        year = int(request.query_params.get('year', now.year))
        month = int(request.query_params.get('month', now.month))

        sub = Subscription.objects.filter(customer=profile, status='active').first()
        if not sub:
            return Response({
                'year': year,
                'month': month,
                'has_subscription': False,
                'days': []
            })

        default_qty = float(sub.default_quantity)
        cutoff_time = profile.dairy.cutoff_time if profile.dairy else datetime.strptime('22:00:00', '%H:%M:%S').time()

        # Days in month
        num_days = calendar.monthrange(year, month)[1]
        start_date = date(year, month, 1)
        end_date = date(year, month, num_days)

        # 1. Fetch overrides
        overrides = {
            ov.date: ov for ov in DeliveryOverride.objects.filter(
                subscription=sub,
                date__range=(start_date, end_date)
            )
        }

        # 2. Fetch vacations
        vacations = VacationPeriod.objects.filter(
            customer=profile,
            is_active=True,
            start_date__lte=end_date,
            end_date__gte=start_date
        )

        def is_in_vacation(d):
            return any(v.start_date <= d <= v.end_date for v in vacations)

        # 3. Fetch past deliveries
        deliveries = {
            deliv.delivery_date: deliv for deliv in DailyDelivery.objects.filter(
                subscription=sub,
                delivery_date__range=(start_date, end_date)
            )
        }

        days_data = []
        for day_num in range(1, num_days + 1):
            cur_date = date(year, month, day_num)
            is_past = cur_date < now.date()
            is_today = cur_date == now.date()
            is_tomorrow = cur_date == (now.date() + timedelta(days=1))

            # Cutoff check:
            # Past dates cannot be modified.
            # Today cannot be modified if already delivered or morning cutoff passed.
            # Tomorrow cannot be modified if current time > cutoff_time.
            can_modify = True
            if is_past:
                can_modify = False
            elif is_today:
                can_modify = False # Modifications close before midnight
            elif is_tomorrow and now.time() > cutoff_time:
                can_modify = False

            in_vac = is_in_vacation(cur_date)
            override = overrides.get(cur_date)
            deliv = deliveries.get(cur_date)

            if override:
                scheduled_qty = float(override.quantity)
                override_type = override.override_type
            elif in_vac:
                scheduled_qty = 0.0
                override_type = 'vacation'
            else:
                scheduled_qty = default_qty
                override_type = None

            # Actual status
            if deliv:
                display_status = deliv.status
                actual_qty = float(deliv.delivered_quantity)
            elif in_vac:
                display_status = 'vacation'
                actual_qty = 0.0
            elif override and float(override.quantity) == 0.0:
                display_status = 'skipped'
                actual_qty = 0.0
            elif is_past:
                display_status = 'missed'
                actual_qty = 0.0
            else:
                display_status = 'scheduled'
                actual_qty = scheduled_qty

            days_data.append({
                'date': cur_date.isoformat(),
                'day': day_num,
                'weekday': cur_date.strftime('%a'),
                'scheduled_quantity': scheduled_qty,
                'actual_quantity': actual_qty,
                'status': display_status,
                'is_override': override is not None,
                'override_type': override_type,
                'override_id': str(override.id) if override else None,
                'is_vacation': in_vac,
                'can_modify': can_modify,
                'is_today': is_today,
                'is_past': is_past
            })

        return Response({
            'year': year,
            'month': month,
            'has_subscription': True,
            'default_quantity': default_qty,
            'unit': sub.product.unit,
            'cutoff_time': cutoff_time.strftime('%H:%M:%S'),
            'days': days_data,
            'vacations': VacationPeriodSerializer(vacations, many=True).data
        })

class SetDeliveryOverrideView(APIView):
    """Sets a date-specific skip, double, or custom quantity with cutoff check."""
    permission_classes = [IsCustomerUser]

    def post(self, request):
        profile = request.user.customer_profile
        sub = Subscription.objects.filter(customer=profile, status='active').first()
        if not sub:
            return Response({'detail': 'No active subscription found.'}, status=status.HTTP_400_BAD_REQUEST)

        date_str = request.data.get('date')
        quantity = request.data.get('quantity')
        override_type = request.data.get('override_type', 'custom')

        if not date_str or quantity is None:
            return Response({'detail': 'date and quantity are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
            target_qty = float(quantity)
        except ValueError:
            return Response({'detail': 'Invalid date or quantity format.'}, status=status.HTTP_400_BAD_REQUEST)

        now = timezone.localtime()
        cutoff_time = profile.dairy.cutoff_time if profile.dairy else datetime.strptime('22:00:00', '%H:%M:%S').time()

        # Business Rule Enforcement: Cutoff time
        if target_date < now.date():
            return Response({'detail': 'Cannot modify past delivery dates.'}, status=status.HTTP_400_BAD_REQUEST)

        if target_date == now.date():
            return Response({
                'detail': 'Changes for today must be made prior to the cutoff time yesterday.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if target_date == (now.date() + timedelta(days=1)) and now.time() > cutoff_time:
            return Response({
                'detail': f'Cutoff time ({cutoff_time.strftime("%I:%M %p")}) has passed for tomorrow. Changes apply from the day after.'
            }, status=status.HTTP_400_BAD_REQUEST)

        if target_qty == 0:
            override_type = 'skip'
        elif target_qty == float(sub.default_quantity) * 2:
            override_type = 'double'

        override, created = DeliveryOverride.objects.update_or_create(
            subscription=sub,
            date=target_date,
            defaults={
                'quantity': target_qty,
                'override_type': override_type,
            }
        )

        # Update or sync existing DailyDelivery record if already generated for this future date
        deliv = DailyDelivery.objects.filter(subscription=sub, delivery_date=target_date).first()
        if deliv:
            deliv.scheduled_quantity = target_qty
            if target_qty == 0:
                deliv.status = 'skipped'
            deliv.save()

        return Response({
            'success': True,
            'message': f"Delivery updated for {target_date.strftime('%d %b')}: {target_qty}L ({override_type})",
            'override': DeliveryOverrideSerializer(override).data
        })

class RemoveDeliveryOverrideView(APIView):
    """Reverts a date override back to standard subscription quantity."""
    permission_classes = [IsCustomerUser]

    def delete(self, request, pk):
        profile = request.user.customer_profile
        override = DeliveryOverride.objects.filter(subscription__customer=profile, id=pk).first()
        if not override:
            return Response({'detail': 'Override not found.'}, status=status.HTTP_404_NOT_FOUND)

        now = timezone.localtime()
        cutoff_time = profile.dairy.cutoff_time if profile.dairy else datetime.strptime('22:00:00', '%H:%M:%S').time()

        if override.date <= now.date():
            return Response({'detail': 'Cannot remove past or current day override.'}, status=status.HTTP_400_BAD_REQUEST)

        if override.date == (now.date() + timedelta(days=1)) and now.time() > cutoff_time:
            return Response({
                'detail': f'Cutoff time ({cutoff_time.strftime("%I:%M %p")}) has passed for tomorrow.'
            }, status=status.HTTP_400_BAD_REQUEST)

        target_date = override.date
        sub = override.subscription
        override.delete()

        # Restore DailyDelivery scheduled quantity
        deliv = DailyDelivery.objects.filter(subscription=sub, delivery_date=target_date).first()
        if deliv:
            deliv.scheduled_quantity = sub.default_quantity
            deliv.status = 'pending'
            deliv.save()

        return Response({'success': True, 'message': 'Override removed. Default quantity restored.'})

class VacationPeriodViewSet(viewsets.ModelViewSet):
    """Customer pauses deliveries over a continuous date range."""
    serializer_class = VacationPeriodSerializer
    permission_classes = [IsCustomerUser]

    def get_queryset(self):
        return VacationPeriod.objects.filter(customer=self.request.user.customer_profile)

    def perform_create(self, serializer):
        vacation = serializer.save(customer=self.request.user.customer_profile)
        # Update any pending deliveries in this range to skipped
        DailyDelivery.objects.filter(
            subscription__customer=vacation.customer,
            delivery_date__range=(vacation.start_date, vacation.end_date),
            status='pending'
        ).update(status='skipped', scheduled_quantity=0.0)

class OrderViewSet(viewsets.ModelViewSet):
    """One-time extra orders (curd, paneer, extra milk bottles)."""
    serializer_class = OrderSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve', 'create']:
            return [permissions.IsAuthenticated()]
        return [IsDairyOrAdmin()]

    def get_queryset(self):
        user = self.request.user
        if user.role == 'customer' and hasattr(user, 'customer_profile'):
            return Order.objects.filter(customer=user.customer_profile)
        elif user.role == 'dairy' and hasattr(user, 'dairy'):
            return Order.objects.filter(dairy=user.dairy)
        elif user.role == 'admin':
            return Order.objects.all()
        return Order.objects.none()

    def perform_create(self, serializer):
        profile = self.request.user.customer_profile
        product = serializer.validated_data['product']
        quantity = serializer.validated_data.get('quantity', 1.0)
        unit_price = product.price_per_unit
        total_price = quantity * unit_price
        serializer.save(
            customer=profile,
            dairy=profile.dairy,
            unit_price=unit_price,
            total_price=total_price
        )
