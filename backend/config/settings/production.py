from .base import *  # noqa: F401,F403
from django.core.exceptions import ImproperlyConfigured

DEBUG = False

if not os.getenv('DJANGO_SECRET_KEY') or 'insecure' in SECRET_KEY or len(SECRET_KEY) < 40:
    raise ImproperlyConfigured('Set a strong DJANGO_SECRET_KEY (50+ random characters) for production.')
if DATABASES['default']['ENGINE'] != 'django.db.backends.postgresql':
    raise ImproperlyConfigured('Production requires PostgreSQL. Set DB_ENGINE=postgres and DATABASE_URL.')
if not DATABASES['default']['PASSWORD']:
    raise ImproperlyConfigured('The database password must be set in production.')
if ALLOWED_HOSTS in ([], ['*']):
    raise ImproperlyConfigured('Set DJANGO_ALLOWED_HOSTS to your real domain(s).')

# Only the configured web origins may call the API from a browser.
CORS_ALLOW_ALL_ORIGINS = False
CSRF_TRUSTED_ORIGINS = [o.strip() for o in os.getenv('CSRF_TRUSTED_ORIGINS', ','.join(CORS_ALLOWED_ORIGINS)).split(',') if o.strip()]

# HTTPS: terminate TLS at the load balancer / proxy and forward X-Forwarded-Proto.
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
SECURE_SSL_REDIRECT = env_bool('SECURE_SSL_REDIRECT', True)
SECURE_REDIRECT_EXEMPT = [r'^healthz$']
SECURE_HSTS_SECONDS = int(os.getenv('SECURE_HSTS_SECONDS', '31536000'))
SECURE_HSTS_INCLUDE_SUBDOMAINS = True
SECURE_HSTS_PRELOAD = env_bool('SECURE_HSTS_PRELOAD', False)
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SESSION_COOKIE_HTTPONLY = True
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin-allow-popups'
X_FRAME_OPTIONS = 'DENY'

# Hashed, compressed static files (requires collectstatic at build time).
STORAGES['staticfiles'] = {'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage'}

# API docs are not public in production.
SPECTACULAR_SETTINGS['SERVE_PERMISSIONS'] = ['apps.core.permissions.IsAdminUser']
