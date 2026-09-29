from django.urls import path
from .views import (
    TodayDeliveriesListView,
    UpdateDeliveryStatusView,
    DeliveryBoyListView,
    DeliveryBoyRouteView,
)

urlpatterns = [
    path('today/', TodayDeliveriesListView.as_view(), name='dairy_today_deliveries'),
    path('<uuid:pk>/status/', UpdateDeliveryStatusView.as_view(), name='update_delivery_status'),
    path('delivery-boys/', DeliveryBoyListView.as_view(), name='delivery_boys_list'),
    path('boy/route/', DeliveryBoyRouteView.as_view(), name='delivery_boy_route'),
]
