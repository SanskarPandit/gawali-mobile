from django.urls import path
from .views import AdminAuditLogsListView

urlpatterns = [
    path('admin/logs/', AdminAuditLogsListView.as_view(), name='admin_audit_logs'),
]
