from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    SubscriptionDetailView,
    CalendarMonthView,
    SetDeliveryOverrideView,
    RemoveDeliveryOverrideView,
    VacationPeriodViewSet,
    OrderViewSet,
)

router = DefaultRouter()
router.register('vacations', VacationPeriodViewSet, basename='customer_vacations')
router.register('orders', OrderViewSet, basename='extras_orders')

urlpatterns = [
    path('plan/', SubscriptionDetailView.as_view(), name='subscription_detail'),
    path('calendar/', CalendarMonthView.as_view(), name='calendar_month'),
    path('override/', SetDeliveryOverrideView.as_view(), name='set_override'),
    path('override/<uuid:pk>/', RemoveDeliveryOverrideView.as_view(), name='remove_override'),
    path('', include(router.urls)),
]
