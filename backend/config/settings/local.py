from .base import *

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / os.getenv('DB_NAME', 'gawali.sqlite3'),
    }
}

# Email Backend for development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
