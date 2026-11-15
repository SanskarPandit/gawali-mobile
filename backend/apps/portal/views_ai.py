from django.conf import settings
from rest_framework import permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.assistant import nvidia

TASK_LABELS = {
    'chat': 'Customer support assistant',
    'vision': 'Refund photo verification',
    'insight': 'Insights, recommendations & route briefs',
    'parse': 'Lab report reading',
}


class AIStatusView(APIView):
    """Which model handles which job, so the UI can label answers honestly."""

    def get(self, request):
        on = nvidia.is_configured()
        return Response({
            'configured': on,
            'engine': nvidia.engine_label('chat'),
            'model': settings.NVIDIA_MODELS['chat'] if on else None,
            'vision_model': settings.NVIDIA_MODELS['vision'] if on else None,
            'tasks': [{'task': t, 'label': TASK_LABELS[t], 'model': settings.NVIDIA_MODELS[t] if on else 'rules'}
                      for t in TASK_LABELS],
            'failover_key': bool(on and settings.NVIDIA_API_KEY_ALT),
        })


class ConfigView(APIView):
    """Feature switches the web app needs before sign-in."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response({'payments_enabled': settings.PAYMENTS_ENABLED, 'passport_enabled': settings.PASSPORT_ENABLED})
