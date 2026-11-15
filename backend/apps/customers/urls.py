from django.urls import path
from .views import (
    CustomerProfileView,
    CustomerSetupView,
    CustomerDashboardView,
    DairyCustomerListView,
    DairyCustomerDetailView,
    DairyRouteReorderView,
)

urlpatterns = [
    path('profile/', CustomerProfileView.as_view(), name='customer_profile'),
    path('setup/', CustomerSetupView.as_view(), name='customer_setup'),
    path('dashboard/', CustomerDashboardView.as_view(), name='customer_dashboard'),
    path('vendor/list/', DairyCustomerListView.as_view(), name='dairy_customers_list'),
    path('vendor/reorder/', DairyRouteReorderView.as_view(), name='dairy_route_reorder'),
    path('vendor/<uuid:pk>/', DairyCustomerDetailView.as_view(), name='dairy_customer_detail'),
]
