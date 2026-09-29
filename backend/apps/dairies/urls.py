from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    PublicDairyListView,
    DairyProfileView,
    DairyDashboardView,
    DeliveryRouteViewSet,
)
from .admin_views import (
    AdminDashboardStatsView,
    AdminUpdateDairyStatusView,
)

router = DefaultRouter()
router.register('routes', DeliveryRouteViewSet, basename='dairy_routes')

urlpatterns = [
    path('public-list/', PublicDairyListView.as_view(), name='dairy_public_list'),
    path('profile/', DairyProfileView.as_view(), name='dairy_profile'),
    path('dashboard/', DairyDashboardView.as_view(), name='dairy_dashboard'),
    path('admin/dashboard/', AdminDashboardStatsView.as_view(), name='admin_dashboard_stats'),
    path('admin/<uuid:pk>/status/', AdminUpdateDairyStatusView.as_view(), name='admin_update_dairy_status'),
    path('', include(router.urls)),
]
