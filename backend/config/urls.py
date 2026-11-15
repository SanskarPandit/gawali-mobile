from django.contrib import admin
from functools import lru_cache

from django.http import Http404, HttpResponse
from django.urls import include, path, re_path
from django.conf import settings
from apps.ops import views as ops_views
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularRedocView,
    SpectacularSwaggerView,
)

urlpatterns = [
    path('admin/', admin.site.urls),

    # OpenAPI Schema & API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),

    # API v1 Endpoints
    path('api/v1/auth/', include('apps.accounts.urls')),
    path('api/v1/dairies/', include('apps.dairies.urls')),
    path('api/v1/customers/', include('apps.customers.urls')),
    path('api/v1/products/', include('apps.products.urls')),
    path('api/v1/subscriptions/', include('apps.subscriptions.urls')),
    path('api/v1/deliveries/', include('apps.deliveries.urls')),
    path('api/v1/billing/', include('apps.billing.urls')),
    path('api/v1/payments/', include('apps.payments.urls')),
    path('api/v1/complaints/', include('apps.complaints.urls')),
    path('api/v1/reports/', include('apps.reports.urls')),
    path('api/v1/audit/', include('apps.audit.urls')),
    path('api/v1/notifications/', include('apps.notifications.urls')),

    # API v2: Gawali experience, organised by role
    path('api/v2/', include('apps.portal.urls')),
    path('api/v2/', include('apps.ops.urls')),

    # Uploads are stored in the database and streamed from here.
    path('media/<path:name>', ops_views.media, name='media'),
    path('healthz', ops_views.health, name='healthz'),
]


@lru_cache(maxsize=1)
def _spa_index() -> bytes:
    index = settings.WEB_DIST / 'index.html'
    if not index.exists():
        raise Http404('Web app not built. Run `npm run build` in web/.')
    return index.read_bytes()


def spa(request, *args, **kwargs):
    """Every non-API URL returns the React app, which routes on the client."""
    resp = HttpResponse(_spa_index(), content_type='text/html; charset=utf-8')
    resp['Cache-Control'] = 'no-cache'
    return resp


urlpatterns += [re_path(r'^(?!api/|admin/|media/|static/|healthz).*$', spa)]

