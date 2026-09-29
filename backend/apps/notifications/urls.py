from django.urls import path
from .views import (
    NotificationListView,
    MarkNotificationReadView,
    MarkAllNotificationsReadView,
)

urlpatterns = [
    path('', NotificationListView.as_view(), name='notifications_list'),
    path('<uuid:pk>/read/', MarkNotificationReadView.as_view(), name='notification_read'),
    path('read-all/', MarkAllNotificationsReadView.as_view(), name='notifications_read_all'),
]
