from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.notifications.models import Notification
from . import push


@receiver(post_save, sender=Notification)
def push_new_notification(sender, instance: Notification, created: bool, **kwargs):
    """Every in-app notification is also pushed to the user's phones and browsers."""
    if not created:
        return
    link = push.ROLE_HOME.get(getattr(instance.user, 'role', ''), '/')
    push.send_async([instance.user_id], instance.title, instance.body,
                    {'type': instance.notification_type, 'id': str(instance.id)}, link)
