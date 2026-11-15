from django.apps import AppConfig


class OpsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.ops'

    def ready(self):
        from . import signals  # noqa: F401  (push every in-app notification)
