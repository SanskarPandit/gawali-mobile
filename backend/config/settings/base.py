import os
from pathlib import Path
from datetime import timedelta
import dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# Neon's variables (written by `neon deploy` to the repo-root .env.local) win over backend/.env:
# load_dotenv never overrides a variable that is already set.
dotenv.load_dotenv(BASE_DIR.parent / '.env.local')
dotenv.load_dotenv(BASE_DIR / '.env')

from django.core.exceptions import ImproperlyConfigured


def env_bool(name, default=False):
    return os.getenv(name, str(default)).strip().lower() in ('true', '1', 't', 'yes')


DEBUG = env_bool('DJANGO_DEBUG', False)

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', '')
if not SECRET_KEY:
    if not DEBUG:
        raise ImproperlyConfigured('DJANGO_SECRET_KEY must be set when DJANGO_DEBUG is off.')
    SECRET_KEY = 'insecure-local-development-only-key'

ALLOWED_HOSTS = [host.strip() for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1,0.0.0.0,10.0.2.2').split(',') if host.strip()]

# Application definition
DJANGO_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
]

THIRD_PARTY_APPS = [
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
]

LOCAL_APPS = [
    'apps.core',
    'apps.accounts',
    'apps.dairies',
    'apps.customers',
    'apps.products',
    'apps.subscriptions',
    'apps.deliveries',
    'apps.billing',
    'apps.payments',
    'apps.complaints',
    'apps.reports',
    'apps.audit',
    'apps.notifications',
    'apps.quality',
    'apps.wallet',
    'apps.refunds',
    'apps.assistant',
    'apps.portal',
    'apps.ops',
]

INSTALLED_APPS = DJANGO_APPS + THIRD_PARTY_APPS + LOCAL_APPS

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'apps.audit.middleware.AuditLogMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

# Database
# DB_ENGINE=postgres for PostgreSQL (recommended, required in production), sqlite for quick local work.
DB_ENGINE = os.getenv('DB_ENGINE', 'sqlite').strip().lower()
DATABASE_URL = os.getenv('DATABASE_URL', '').strip()
# Schema changes need a direct (unpooled) connection; PgBouncer transaction mode can break them.
# Long-running admin jobs (the demo seed) also use the direct connection, per Neon's guidance.
DIRECT_COMMANDS = {'migrate', 'makemigrations', 'createcachetable', 'dbshell', 'sqlmigrate', 'showmigrations', 'seed_demo'}
if DB_ENGINE in ('postgres', 'postgresql') and DATABASE_URL:
    # Neon: DATABASE_URL is the pooled (-pooler) endpoint, DATABASE_URL_UNPOOLED the direct one.
    import sys
    from urllib.parse import parse_qs, unquote, urlparse

    if len(sys.argv) > 1 and sys.argv[1] in DIRECT_COMMANDS and os.getenv('DATABASE_URL_UNPOOLED'):
        DATABASE_URL = os.environ['DATABASE_URL_UNPOOLED'].strip()
    _db = urlparse(DATABASE_URL)
    _query = {k: v[0] for k, v in parse_qs(_db.query).items()}
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': (_db.path or '/postgres').lstrip('/'),
            'USER': unquote(_db.username or ''),
            'PASSWORD': unquote(_db.password or ''),
            'HOST': _db.hostname,
            'PORT': str(_db.port or 5432),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'CONN_HEALTH_CHECKS': True,
            'OPTIONS': {'sslmode': _query.get('sslmode', os.getenv('DB_SSLMODE', 'require')), 'connect_timeout': 15,
                        # TCP keepalives: notice a dropped connection in ~1 minute instead of hanging for many.
                        'keepalives': 1, 'keepalives_idle': 30, 'keepalives_interval': 10, 'keepalives_count': 3,
                        **({'channel_binding': _query['channel_binding']} if 'channel_binding' in _query else {})},
        }
    }
    # Transaction-mode poolers (Neon -pooler, Supabase :6543): many app connections share a few
    # server connections, which cannot keep prepared statements or server-side cursors.
    _pooled = '-pooler' in (_db.hostname or '') or str(_db.port) == '6543'
    if _pooled or os.getenv('DB_POOL_MODE', '').lower() == 'transaction':
        DATABASES['default']['OPTIONS']['prepare_threshold'] = None
        DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True
        DATABASES['default']['CONN_MAX_AGE'] = int(os.getenv('DB_CONN_MAX_AGE', '0'))
elif DB_ENGINE in ('postgres', 'postgresql'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME', 'gawali_db'),
            'USER': os.getenv('DB_USER', 'gawali_user'),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': int(os.getenv('DB_CONN_MAX_AGE', '60')),
            'CONN_HEALTH_CHECKS': True,
            'OPTIONS': {'sslmode': os.getenv('DB_SSLMODE', 'prefer')},
        }
    }
elif DB_ENGINE == 'sqlite':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / os.getenv('SQLITE_PATH', 'gawali.sqlite3'),
        }
    }
else:
    raise ImproperlyConfigured(f"Unsupported DB_ENGINE '{DB_ENGINE}'. Use 'postgres' or 'sqlite'.")

# Custom User Model
AUTH_USER_MODEL = 'accounts.User'

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Asia/Kolkata'
USE_I18N = True
USE_TZ = True

# Static & Media files
STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'  # unused: uploads go to Neon Object Storage (or the database)
# Neon Object Storage when its S3 credentials are present (production); database storage otherwise.
# On Vercel use the NEON_S3_* names: Vercel may inject its own AWS_* values into functions.
AWS_ACCESS_KEY_ID = os.getenv('NEON_S3_ACCESS_KEY_ID') or os.getenv('AWS_ACCESS_KEY_ID', '')
AWS_SECRET_ACCESS_KEY = os.getenv('NEON_S3_SECRET_ACCESS_KEY') or os.getenv('AWS_SECRET_ACCESS_KEY', '')
AWS_ENDPOINT_URL_S3 = os.getenv('NEON_S3_ENDPOINT') or os.getenv('AWS_ENDPOINT_URL_S3', '')
AWS_REGION = os.getenv('NEON_S3_REGION') or os.getenv('AWS_REGION', '')
NEON_STORAGE_BUCKET = os.getenv('NEON_STORAGE_BUCKET', 'assets')
USE_OBJECT_STORAGE = bool(AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY and AWS_ENDPOINT_URL_S3)
STORAGES = {
    'default': {'BACKEND': 'apps.ops.neon_storage.NeonObjectStorage' if USE_OBJECT_STORAGE else 'apps.ops.storage.DatabaseStorage'},
    'staticfiles': {'BACKEND': 'whitenoise.storage.CompressedStaticFilesStorage'},
}
# The built React app (web/dist) is served from the site root by WhiteNoise, with an SPA fallback view.
WEB_DIST = Path(os.getenv('WEB_DIST', BASE_DIR.parent / 'web' / 'dist'))
WHITENOISE_ROOT = WEB_DIST if WEB_DIST.exists() else None

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'apps.core.pagination.StandardResultsSetPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_FILTER_BACKENDS': (
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'rest_framework.filters.OrderingFilter',
    ),
    'EXCEPTION_HANDLER': 'apps.core.exceptions.custom_exception_handler',
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'anon': os.getenv('THROTTLE_ANON', '120/min'),
        'user': os.getenv('THROTTLE_USER', '600/min'),
        'login': os.getenv('THROTTLE_LOGIN', '10/min'),
        'signup': os.getenv('THROTTLE_SIGNUP', '5/min'),
        'refund': os.getenv('THROTTLE_REFUND', '10/hour'),
        'ai': os.getenv('THROTTLE_AI', '40/hour'),
        'upload': os.getenv('THROTTLE_UPLOAD', '60/hour'),
    },
}

# SimpleJWT
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.getenv('JWT_ACCESS_TOKEN_LIFETIME_MINUTES', '1440'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.getenv('JWT_REFRESH_TOKEN_LIFETIME_DAYS', '30'))),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': False,
    'UPDATE_LAST_LOGIN': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
    'USER_ID_FIELD': 'id',
    'USER_ID_CLAIM': 'user_id',
}

# OpenAPI / drf-spectacular Documentation
SPECTACULAR_SETTINGS = {
    'TITLE': 'Gawali Milk Subscription API',
    'DESCRIPTION': 'Enterprise API platform for milk subscriptions, daily delivery manifests, vacation pauses, and postpaid billing.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
    'SCHEMA_PATH_PREFIX': '/api/v[0-9]',
}

# CORS Configuration
CORS_ALLOW_ALL_ORIGINS = DEBUG
CORS_ALLOWED_ORIGINS = [origin.strip() for origin in os.getenv('CORS_ALLOWED_ORIGINS', 'http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,http://10.0.2.2:8000').split(',') if origin.strip()]
CORS_ALLOW_CREDENTIALS = True

# Razorpay credentials
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'rzp_test_gawali_demo')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'rzp_test_secret_demo')
RAZORPAY_WEBHOOK_SECRET = os.getenv('RAZORPAY_WEBHOOK_SECRET', 'rzp_webhook_secret_demo')

# Business Configuration Defaults
DEFAULT_CUTOFF_TIME = os.getenv('DEFAULT_CUTOFF_TIME', '22:00:00')
DEFAULT_BILLING_CYCLE = os.getenv('DEFAULT_BILLING_CYCLE', 'monthly')
DELIVERY_SYNC_WINDOW_DAYS = int(os.getenv('DELIVERY_SYNC_WINDOW_DAYS', '2'))

# NVIDIA NIM (free hosted models: Nemotron, Kimi). OpenAI-compatible chat completions API.
# Without NVIDIA_API_KEY every AI feature falls back to deterministic rules, so the app keeps working.
NVIDIA_API_KEY = os.getenv('NVIDIA_API_KEY', '').strip()
# Optional second key: used automatically when the first is rate-limited or erroring.
NVIDIA_API_KEY_ALT = os.getenv('NVIDIA_API_KEY_ALT', '').strip()
NVIDIA_BASE_URL = os.getenv('NVIDIA_BASE_URL', 'https://integrate.api.nvidia.com/v1').rstrip('/')
# One model per job, each chosen for its latency/skill trade-off.
NVIDIA_MODELS = {
    'chat': os.getenv('NVIDIA_CHAT_MODEL', 'minimaxai/minimax-m3.1-flash').strip(),            # customer support assistant
    'vision': os.getenv('NVIDIA_VISION_MODEL', 'nvidia/nemotron-3.5-super-vl-120b-a12b').strip(),  # refund photo verification
    'insight': os.getenv('NVIDIA_INSIGHT_MODEL', 'nvidia/nemotron-3.5-lightning-30b-a3b').strip(), # dairy insights, recs, briefs
    'parse': os.getenv('NVIDIA_PARSE_MODEL', 'nvidia/nemotron-parse').strip(),                    # lab-report document parsing
}
NVIDIA_MODEL = NVIDIA_MODELS['chat']
NVIDIA_VISION_MODEL = NVIDIA_MODELS['vision']
NVIDIA_TIMEOUT_SECONDS = float(os.getenv('NVIDIA_TIMEOUT_SECONDS', '25'))

# Batch Purity Passport (lab results + cold-chain curve). Hidden until real sensor and lab data is connected.
PASSPORT_ENABLED = env_bool('PASSPORT_ENABLED', False)

# Firebase Cloud Messaging. Server sending needs the service-account JSON (raw or base64) in
# FIREBASE_SERVICE_ACCOUNT; browser push additionally needs the web app config and VAPID key.
FIREBASE_SERVICE_ACCOUNT = os.getenv('FIREBASE_SERVICE_ACCOUNT', '')
FIREBASE_PROJECT_ID = os.getenv('FIREBASE_PROJECT_ID', '')
FIREBASE_MESSAGING_SENDER_ID = os.getenv('FIREBASE_MESSAGING_SENDER_ID', '')
FIREBASE_WEB_API_KEY = os.getenv('FIREBASE_WEB_API_KEY', '')
FIREBASE_WEB_APP_ID = os.getenv('FIREBASE_WEB_APP_ID', '')
FIREBASE_VAPID_KEY = os.getenv('FIREBASE_VAPID_KEY', '')

# Sentry error monitoring: set SENTRY_DSN to enable.
SENTRY_DSN = os.getenv('SENTRY_DSN', '').strip()
if SENTRY_DSN:
    import sentry_sdk

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=os.getenv('SENTRY_ENVIRONMENT', 'production' if not DEBUG else 'development'),
        traces_sample_rate=float(os.getenv('SENTRY_TRACES_SAMPLE_RATE', '0.1')),
        send_default_pii=False,
    )

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '%(asctime)s %(levelname)s %(name)s: %(message)s'}},
    'handlers': {'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'}},
    'root': {'handlers': ['console'], 'level': os.getenv('LOG_LEVEL', 'INFO')},
    'loggers': {'django.db.backends': {'level': 'WARNING'}},
}

# Shared secret for the scheduler tick (/api/v2/cron/tick). Vercel Cron sends it as a Bearer token.
CRON_SECRET = os.getenv('CRON_SECRET', '').strip()

# Payment gateway (UPI top-up, withdrawals, Autopay mandates). Off until a real gateway is wired up:
# charges and credits are still recorded in the ledger and settled with the dairy offline.
PAYMENTS_ENABLED = env_bool('PAYMENTS_ENABLED', False)

# Uploaded photos (delivery proof, refund evidence)
DATA_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 8 * 1024 * 1024

# Shared by every app server and the scheduler (AI answers, throttling, background-job locks).
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
        'LOCATION': 'gawali_cache',
    }
}

# Celery Broker & Backend
CELERY_BROKER_URL = os.getenv('CELERY_BROKER_URL', 'redis://localhost:6379/1')
CELERY_RESULT_BACKEND = os.getenv('CELERY_RESULT_BACKEND', 'redis://localhost:6379/2')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE

# API-docs schema hints for plain APIViews; they do not affect runtime.
SILENCED_SYSTEM_CHECKS = ['drf_spectacular.W001', 'drf_spectacular.W002']
