from django.urls import path

from . import views as v

urlpatterns = [
    path('cron/tick/', v.CronTickView.as_view()),
    path('push/config/', v.PushConfigView.as_view()),
    path('devices/', v.DeviceView.as_view()),
    path('admin/overview/', v.AdminOverviewView.as_view()),
    path('admin/dairies/', v.AdminDairiesView.as_view()),
    path('admin/dairies/<uuid:pk>/', v.AdminDairyDetailView.as_view()),
    path('admin/users/', v.AdminUsersView.as_view()),
    path('admin/users/<uuid:pk>/', v.AdminUserDetailView.as_view()),
    path('admin/refunds/', v.AdminRefundsView.as_view()),
    path('admin/ai/', v.AdminAIView.as_view()),
    path('admin/broadcast/', v.AdminBroadcastView.as_view()),
    path('admin/jobs/', v.AdminJobsView.as_view()),
    path('admin/audit/', v.AdminAuditView.as_view()),
]
