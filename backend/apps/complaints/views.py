from rest_framework import viewsets, permissions, status
from rest_framework.views import APIView
from rest_framework.response import Response
from django.utils import timezone
from apps.core.permissions import IsCustomerUser, IsDairyUser
from .models import Complaint
from .serializers import ComplaintSerializer, ResolveComplaintSerializer

class CustomerComplaintViewSet(viewsets.ModelViewSet):
    """Customer can raise a support issue and check resolution status."""
    serializer_class = ComplaintSerializer
    permission_classes = [IsCustomerUser]

    def get_queryset(self):
        return Complaint.objects.filter(customer=self.request.user.customer_profile)

    def perform_create(self, serializer):
        profile = self.request.user.customer_profile
        serializer.save(customer=profile, dairy=profile.dairy)

class DairyComplaintViewSet(viewsets.ReadOnlyModelViewSet):
    """Dairy vendor reviews complaints lodged by their subscribers."""
    serializer_class = ComplaintSerializer
    permission_classes = [IsDairyUser]

    def get_queryset(self):
        return Complaint.objects.filter(dairy=self.request.user.dairy).order_by('-created_at')

class ResolveComplaintView(APIView):
    """Dairy vendor resolves ticket and adds resolution notes."""
    permission_classes = [IsDairyUser]

    def patch(self, request, pk):
        complaint = Complaint.objects.filter(dairy=request.user.dairy, id=pk).first()
        if not complaint:
            return Response({'detail': 'Complaint not found.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ResolveComplaintSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        complaint.status = data['status']
        complaint.resolution_notes = data['resolution_notes']
        if data['status'] in ['resolved', 'closed']:
            complaint.resolved_at = timezone.now()
        complaint.save()

        return Response({
            'success': True,
            'message': f"Complaint marked as {complaint.status}",
            'complaint': ComplaintSerializer(complaint).data
        })
