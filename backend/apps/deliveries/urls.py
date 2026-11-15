from django.urls import path
from .views import (
    TodayDeliveriesListView,
    UpdateDeliveryStatusView,
    DeliverySyncView,
    DeliveryBoyListView,
    DeliveryBoyDetailView,
    DeliveryBoyRouteView,
)

urlpatterns = [
    path('today/', TodayDeliveriesListView.as_view(), name='dairy_today_deliveries'),
    path('sync/', DeliverySyncView.as_view(), name='delivery_sync'),
    path('<uuid:pk>/status/', UpdateDeliveryStatusView.as_view(), name='update_delivery_status'),
    path('delivery-boys/', DeliveryBoyListView.as_view(), name='delivery_boys_list'),
    path('delivery-boys/<uuid:pk>/', DeliveryBoyDetailView.as_view(), name='delivery_boy_detail'),
    path('boy/route/', DeliveryBoyRouteView.as_view(), name='delivery_boy_route'),
]
