from .base import *  # noqa: F401,F403

# Local development. The database comes from DB_ENGINE / DB_* in .env (see .env.example).

# Email Backend for development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
