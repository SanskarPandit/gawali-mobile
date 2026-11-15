import os

# Tests must not depend on a developer's .env: pin everything they need before base settings load.
os.environ.setdefault('DJANGO_SECRET_KEY', 'test-only-secret-key')
os.environ['DB_ENGINE'] = 'sqlite'
os.environ['SQLITE_PATH'] = 'test_gawali.sqlite3'
# Never spend real NVIDIA quota from tests: AI features run on their deterministic rules.
os.environ['NVIDIA_API_KEY'] = ''
os.environ['NVIDIA_API_KEY_ALT'] = ''

from .base import *  # noqa: E402,F401,F403

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']  # fast hashing for tests only
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
CELERY_TASK_ALWAYS_EAGER = True
# Tests never touch real cloud storage or a real database.
STORAGES = {**STORAGES, 'default': {'BACKEND': 'apps.ops.storage.DatabaseStorage'}}
USE_OBJECT_STORAGE = False
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache', 'LOCATION': 'tests'}}
# Throttling is exercised by dedicated tests; keep the rest of the suite from tripping limits.
REST_FRAMEWORK = {**REST_FRAMEWORK, 'DEFAULT_THROTTLE_RATES': {**REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'],
                                                               'anon': '10000/min', 'user': '10000/min',
                                                               'login': '10000/min', 'signup': '10000/min',
                                                               'refund': '10000/min', 'ai': '10000/min',
                                                               'upload': '10000/min'}}
FIREBASE_SERVICE_ACCOUNT = ''
SENTRY_DSN = ''
