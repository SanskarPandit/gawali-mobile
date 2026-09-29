from rest_framework import viewsets, generics, permissions, status
from rest_framework.response import Response
from apps.core.permissions import IsDairyUser, IsCustomerUser
from .models import Product
from .serializers import ProductSerializer

class DairyProductViewSet(viewsets.ModelViewSet):
    """Dairy owner manages their catalogue (milk types, curd, paneer, ghee)."""
    serializer_class = ProductSerializer
    permission_classes = [IsDairyUser]

    def get_queryset(self):
        return Product.objects.filter(dairy=self.request.user.dairy)

    def perform_create(self, serializer):
        serializer.save(dairy=self.request.user.dairy)

class CustomerShopProductsView(generics.ListAPIView):
    """Returns products available to customer from their assigned dairy."""
    serializer_class = ProductSerializer
    permission_classes = [IsCustomerUser]

    def get_queryset(self):
        profile = getattr(self.request.user, 'customer_profile', None)
        if not profile or not profile.dairy:
            return Product.objects.none()
        return Product.objects.filter(dairy=profile.dairy, is_available=True)

class PublicDairyProductsView(generics.ListAPIView):
    """Public listing of products for a specific dairy (for onboarding choice)."""
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        dairy_id = self.kwargs.get('dairy_id')
        return Product.objects.filter(dairy_id=dairy_id, is_available=True)
