from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import DairyProductViewSet, CustomerShopProductsView, PublicDairyProductsView

router = DefaultRouter()
router.register('vendor', DairyProductViewSet, basename='dairy_products')

urlpatterns = [
    path('shop/', CustomerShopProductsView.as_view(), name='customer_shop_products'),
    path('dairy/<uuid:dairy_id>/', PublicDairyProductsView.as_view(), name='public_dairy_products'),
    path('', include(router.urls)),
]
