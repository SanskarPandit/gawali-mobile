from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CustomerComplaintViewSet,
    DairyComplaintViewSet,
    ResolveComplaintView,
)

router = DefaultRouter()
router.register('customer', CustomerComplaintViewSet, basename='customer_complaints')
router.register('vendor', DairyComplaintViewSet, basename='vendor_complaints')

urlpatterns = [
    path('vendor/<uuid:pk>/resolve/', ResolveComplaintView.as_view(), name='resolve_complaint'),
    path('', include(router.urls)),
]
