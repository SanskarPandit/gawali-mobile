from rest_framework import generics, serializers
from apps.core.permissions import IsAdminUser
from .models import AuditLog

class AuditLogSerializer(serializers.ModelSerializer):
    actor_name = serializers.CharField(source='actor.full_name', read_only=True)
    actor_email = serializers.CharField(source='actor.email', read_only=True)

    class Meta:
        model = AuditLog
        fields = ['id', 'actor', 'actor_name', 'actor_email', 'action', 'entity_name', 'entity_id', 'details', 'ip_address', 'created_at']

class AdminAuditLogsListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [IsAdminUser]

    def get_queryset(self):
        qs = AuditLog.objects.all().select_related('actor')
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)
        return qs
