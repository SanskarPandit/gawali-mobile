from datetime import timedelta

from django.conf import settings
from django.db import connection
from django.db.models import Avg, Count, Q, Sum
from django.db.models.functions import TruncDate
from django.http import Http404, HttpResponse, JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import permissions
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import User
from apps.accounts.services import revoke_all_tokens
from apps.assistant.models import AIInteraction
from apps.audit.models import AuditLog
from apps.core.permissions import IsAdminUser
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy
from apps.deliveries.models import DailyDelivery
from apps.notifications.models import Notification
from apps.refunds.models import RefundClaim
from apps.wallet.models import Wallet, WalletTransaction
from . import push
from .jobs import JOBS, run_due_jobs
from .models import DeviceToken, JobRun, StoredFile


# --- Public utility endpoints ---------------------------------------------------------------

@require_GET
def media(request, name):
    """
    Serve an upload by its unguessable key, so the URL works in <img> tags. With Neon Object Storage
    the private object is reached through a fresh presigned URL; otherwise it comes from the database.
    """
    from django.core.files.storage import default_storage
    from django.http import HttpResponseRedirect

    if hasattr(default_storage, 'presigned_url'):
        if '..' in name or name.startswith('/'):
            raise Http404('File not found')
        resp = HttpResponseRedirect(default_storage.presigned_url(name))
        resp['Cache-Control'] = 'private, max-age=600'  # under the 15-minute signature lifetime
        return resp
    f = StoredFile.objects.filter(name=name).only('content', 'content_type', 'size').first()
    if f is None:
        raise Http404('File not found')
    resp = HttpResponse(bytes(f.content), content_type=f.content_type)
    resp['Cache-Control'] = 'private, max-age=86400'
    resp['X-Content-Type-Options'] = 'nosniff'
    return resp


@require_GET
def health(request):
    """Liveness by default. `?deep=1` also checks the database (kept off the frequent probe so an
    idle Neon compute can scale to zero)."""
    if request.GET.get('deep') != '1':
        return JsonResponse({'status': 'ok'})
    try:
        with connection.cursor() as c:
            c.execute('SELECT 1')
        db = 'ok'
    except Exception as exc:  # pragma: no cover
        db = f'error: {exc.__class__.__name__}'
    last = JobRun.objects.order_by('-created_at').values_list('created_at', flat=True).first()
    return JsonResponse({'status': 'ok' if db == 'ok' else 'degraded', 'database': db,
                         'scheduler_last_run': last.isoformat() if last else None},
                        status=200 if db == 'ok' else 503)


class CronTickView(APIView):
    """
    Run whatever scheduled jobs are due. Called by Vercel Cron (which sends `Authorization: Bearer
    $CRON_SECRET`) or any external pinger with the same header. Jobs are idempotent per period, so
    calling this often, late or twice is safe.
    """
    permission_classes = [permissions.AllowAny]
    authentication_classes = []
    throttle_classes = []

    def get(self, request):
        import hmac

        secret = settings.CRON_SECRET
        given = request.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        if not secret or not hmac.compare_digest(given, secret):
            return Response({'detail': 'Not allowed.'}, status=403)
        results = run_due_jobs()
        return Response({'ran': results, 'at': timezone.localtime().isoformat()})

    post = get


class PushConfigView(APIView):
    """Firebase web config for the browser (all public values). Push is offered only when complete."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        web = {
            'apiKey': settings.FIREBASE_WEB_API_KEY, 'projectId': settings.FIREBASE_PROJECT_ID,
            'messagingSenderId': settings.FIREBASE_MESSAGING_SENDER_ID, 'appId': settings.FIREBASE_WEB_APP_ID,
        }
        ready = all(web.values()) and bool(settings.FIREBASE_VAPID_KEY)
        return Response({'enabled': ready, 'server_ready': push.is_configured(),
                         'config': web if ready else None, 'vapidKey': settings.FIREBASE_VAPID_KEY if ready else None})


class DeviceView(APIView):
    """Register or remove this browser/phone for push."""

    def post(self, request):
        token = str(request.data.get('token', '')).strip()
        if len(token) < 20:
            raise ValidationError({'token': ['A valid FCM token is required.']})
        platform = request.data.get('platform', 'web')
        if platform not in DeviceToken.Platform.values:
            platform = 'web'
        DeviceToken.objects.update_or_create(token=token, defaults={'user': request.user, 'platform': platform,
                                                                    'is_active': True, 'last_error': ''})
        return Response({'registered': True}, status=201)

    def delete(self, request):
        DeviceToken.objects.filter(user=request.user, token=str(request.data.get('token', ''))).delete()
        return Response(status=204)


# --- Admin console ------------------------------------------------------------------------

def audit(request, action, entity='', entity_id='', **details):
    AuditLog.objects.create(actor=request.user, action=action, entity_name=entity, entity_id=str(entity_id),
                            details=details, ip_address=getattr(request, 'client_ip', None),
                            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500])


class AdminView(APIView):
    permission_classes = [IsAdminUser]


class AdminOverviewView(AdminView):
    def get(self, request):
        today = timezone.localdate()
        start = today - timedelta(days=13)
        roles = dict(User.objects.filter(is_deleted=False).values_list('role').annotate(n=Count('id')))
        week_ago = timezone.now() - timedelta(days=7)
        ai = AIInteraction.objects.filter(created_at__gte=week_ago)
        ai_by_task = list(ai.values('task').annotate(calls=Count('id'), avg_ms=Avg('latency_ms'),
                                                     errors=Count('id', filter=~Q(error=''))).order_by('task'))
        deliveries = dict(DailyDelivery.objects.filter(delivery_date__range=(start, today), status='delivered')
                          .values_list('delivery_date').annotate(n=Count('subscription__customer', distinct=True)))
        signups = dict(User.objects.filter(created_at__date__gte=start).annotate(d=TruncDate('created_at'))
                       .values_list('d').annotate(n=Count('id')))
        month = WalletTransaction.objects.filter(created_at__date__gte=today.replace(day=1))
        return Response({
            'users': {'customers': roles.get('customer', 0), 'dairies': roles.get('dairy', 0),
                      'partners': roles.get('delivery_boy', 0), 'admins': roles.get('admin', 0)},
            'dairies': {'active': Dairy.objects.filter(is_active=True, is_verified=True).count(),
                        'pending': Dairy.objects.filter(is_verified=False, is_active=True).count(),
                        'suspended': Dairy.objects.filter(is_active=False).count()},
            'households_active': CustomerProfile.objects.filter(is_active=True, subscriptions__status='active').distinct().count(),
            'deliveries_today': DailyDelivery.objects.filter(delivery_date=today, status='delivered')
            .values('subscription__customer').distinct().count(),
            'month_billed': month.filter(direction='debit', kind__in=('delivery', 'order', 'autopay')).aggregate(t=Sum('amount'))['t'] or 0,
            'month_collected': month.filter(kind='adjustment', direction='credit').aggregate(t=Sum('amount'))['t'] or 0,
            'outstanding_dues': -(Wallet.objects.filter(balance__lt=0).aggregate(t=Sum('balance'))['t'] or 0),
            'refunds': {'open': RefundClaim.objects.filter(status='under_review').count(),
                        'credited_month': RefundClaim.objects.filter(status='credited', created_at__date__gte=today.replace(day=1))
                        .aggregate(t=Sum('amount'))['t'] or 0},
            'ai': {'calls_7d': ai.count(), 'by_task': ai_by_task,
                   'labelled': AIInteraction.objects.exclude(label='').count(),
                   'configured': bool(settings.NVIDIA_API_KEY)},
            'push': {'server_ready': push.is_configured(), 'devices': DeviceToken.objects.filter(is_active=True).count()},
            'series': [{'date': (start + timedelta(days=i)).isoformat(),
                        'deliveries': deliveries.get(start + timedelta(days=i), 0),
                        'signups': signups.get(start + timedelta(days=i), 0)}
                       for i in range(14)],
            'jobs': [{'job': r.job, 'period': r.period, 'status': r.status, 'at': timezone.localtime(r.created_at).isoformat()}
                     for r in JobRun.objects.order_by('-created_at')[:8]],
        })


def dairy_row(d: Dairy) -> dict:
    return {
        'id': str(d.id), 'name': d.business_name, 'owner': d.user.full_name, 'email': d.user.email, 'phone': d.phone,
        'city': d.city, 'hub_name': d.hub_name, 'is_verified': d.is_verified, 'is_active': d.is_active,
        'households': d.customers.filter(is_active=True).count(), 'partners': d.delivery_boys.filter(is_active=True).count(),
        'credit_limit': d.credit_limit, 'created_at': d.created_at.isoformat(),
    }


class AdminDairiesView(AdminView):
    def get(self, request):
        qs = Dairy.all_objects.select_related('user').order_by('is_verified', '-created_at')
        status = request.query_params.get('status')
        if status == 'pending':
            qs = qs.filter(is_verified=False, is_active=True)
        elif status == 'suspended':
            qs = qs.filter(is_active=False)
        elif status == 'active':
            qs = qs.filter(is_verified=True, is_active=True)
        if request.query_params.get('search'):
            s = request.query_params['search']
            qs = qs.filter(Q(business_name__icontains=s) | Q(city__icontains=s) | Q(user__email__icontains=s))
        return Response([dairy_row(d) for d in qs[:200]])


class AdminDairyDetailView(AdminView):
    def patch(self, request, pk):
        d = Dairy.all_objects.select_related('user').filter(id=pk).first()
        if d is None:
            raise NotFound('Dairy not found.')
        changes = {}
        for f in ('is_verified', 'is_active'):
            if f in request.data:
                setattr(d, f, bool(request.data[f]))
                changes[f] = bool(request.data[f])
        d.save()
        if 'is_active' in changes:
            d.user.is_active = d.is_active
            d.user.save(update_fields=['is_active'])
            if not d.is_active:
                revoke_all_tokens(d.user)
        if changes.get('is_verified'):
            Notification.objects.create(user=d.user, title='Your dairy is live',
                                        body=f'{d.business_name} has been approved. Customers can now find and subscribe to you.')
        audit(request, 'DAIRY_UPDATE', 'Dairy', d.id, **changes)
        return Response(dairy_row(d))


def user_row(u: User) -> dict:
    org = None
    if u.role == 'dairy' and hasattr(u, 'dairy'):
        org = u.dairy.business_name
    elif u.role == 'delivery_boy' and hasattr(u, 'delivery_profile'):
        org = u.delivery_profile.dairy.business_name
    elif u.role == 'customer' and hasattr(u, 'customer_profile') and u.customer_profile.dairy_id:
        org = u.customer_profile.dairy.business_name
    return {'id': str(u.id), 'name': u.full_name, 'email': u.email, 'phone': u.phone, 'role': u.role,
            'is_active': u.is_active, 'organisation': org, 'joined': u.created_at.isoformat(),
            'last_login': u.last_login.isoformat() if u.last_login else None}


class AdminUsersView(AdminView):
    def get(self, request):
        qs = User.objects.filter(is_deleted=False).select_related('dairy', 'delivery_profile__dairy', 'customer_profile__dairy')
        p = request.query_params
        if p.get('role'):
            qs = qs.filter(role=p['role'])
        if p.get('search'):
            s = p['search']
            qs = qs.filter(Q(full_name__icontains=s) | Q(email__icontains=s) | Q(phone__icontains=s))
        if p.get('status') == 'suspended':
            qs = qs.filter(is_active=False)
        return Response({'count': qs.count(), 'results': [user_row(u) for u in qs.order_by('-created_at')[:200]]})


class AdminUserDetailView(AdminView):
    def patch(self, request, pk):
        u = User.objects.filter(id=pk, is_deleted=False).first()
        if u is None:
            raise NotFound('User not found.')
        if u.pk == request.user.pk:
            raise ValidationError({'detail': 'You cannot change your own account here.'})
        if 'is_active' in request.data:
            u.is_active = bool(request.data['is_active'])
            u.save(update_fields=['is_active'])
            if not u.is_active:
                revoke_all_tokens(u)
                DeviceToken.objects.filter(user=u).update(is_active=False)
            audit(request, 'USER_SUSPEND' if not u.is_active else 'USER_REACTIVATE', 'User', u.id, email=u.email)
        return Response(user_row(u))


class AdminRefundsView(AdminView):
    def get(self, request):
        qs = RefundClaim.objects.select_related('customer__user', 'customer__dairy', 'delivery__subscription__product')
        if request.query_params.get('status'):
            qs = qs.filter(status=request.query_params['status'])
        return Response([{
            'id': str(r.id), 'customer': r.customer.user.full_name, 'dairy': r.customer.dairy.business_name if r.customer.dairy else None,
            'issue': r.get_issue_display(), 'amount': r.amount, 'status': r.status, 'ai_verdict': r.ai_verdict,
            'ai_engine': r.ai_engine, 'ai_confidence': r.ai_confidence, 'processing_ms': r.processing_ms,
            'photo': r.photo.url if r.photo else None, 'created_at': r.created_at.isoformat(),
        } for r in qs[:100]])


class AdminAIView(AdminView):
    def get(self, request):
        qs = AIInteraction.objects.all()
        if request.query_params.get('task'):
            qs = qs.filter(task=request.query_params['task'])
        stats = list(AIInteraction.objects.values('task', 'model').annotate(
            calls=Count('id'), avg_ms=Avg('latency_ms'), errors=Count('id', filter=~Q(error='')),
            correct=Count('id', filter=Q(label='correct')), wrong=Count('id', filter=Q(label='wrong'))).order_by('task'))
        return Response({'stats': stats, 'recent': [{
            'id': str(r.id), 'task': r.task, 'model': r.model, 'latency_ms': r.latency_ms, 'error': r.error,
            'output': r.output[:300], 'label': r.label, 'label_note': r.label_note,
            'feature': (r.context or {}).get('feature'), 'created_at': r.created_at.isoformat(),
        } for r in qs.order_by('-created_at')[:60]]})


AUDIENCES = {'all': None, 'customer': 'customer', 'dairy': 'dairy', 'delivery_boy': 'delivery_boy'}


class AdminBroadcastView(AdminView):
    """In-app notification (and push, when configured) to every user of a role."""

    def post(self, request):
        audience = request.data.get('audience', 'all')
        title = str(request.data.get('title', '')).strip()[:200]
        body = str(request.data.get('body', '')).strip()[:1000]
        if audience not in AUDIENCES:
            raise ValidationError({'audience': ['Choose all, customer, dairy or delivery_boy.']})
        if not title or not body:
            raise ValidationError({'title': ['Title and message are both required.']})
        users = User.objects.filter(is_active=True, is_deleted=False).exclude(role='admin')
        if AUDIENCES[audience]:
            users = users.filter(role=AUDIENCES[audience])
        ids = list(users.values_list('id', flat=True))
        Notification.objects.bulk_create([Notification(user_id=i, title=title, body=body) for i in ids], batch_size=1000)
        push.send_async(ids, title, body)
        audit(request, 'BROADCAST', 'Notification', '', audience=audience, title=title, recipients=len(ids))
        return Response({'recipients': len(ids), 'push': push.is_configured()}, status=201)


class AdminJobsView(AdminView):
    def get(self, request):
        last = {}
        for r in JobRun.objects.order_by('-created_at')[:300]:
            last.setdefault(r.job, r)
        return Response({
            'jobs': [{'name': j.name, 'description': j.description, 'per_dairy': j.per_dairy,
                      'last_status': last[j.name].status if j.name in last else None,
                      'last_run': timezone.localtime(last[j.name].created_at).isoformat() if j.name in last else None,
                      'last_detail': last[j.name].detail if j.name in last else None} for j in JOBS],
            'recent': [{'job': r.job, 'period': r.period, 'status': r.status, 'detail': r.detail,
                        'at': timezone.localtime(r.created_at).isoformat()} for r in JobRun.objects.order_by('-created_at')[:40]],
        })

    def post(self, request):
        name = request.data.get('job')
        if name not in {j.name for j in JOBS}:
            raise ValidationError({'job': ['Unknown job.']})
        results = run_due_jobs(only=name)
        audit(request, 'JOB_RUN', 'Job', name, results=len(results))
        return Response({'ran': results, 'note': None if results else 'Not due yet, or already ran for this period.'})


class AdminAuditView(AdminView):
    def get(self, request):
        return Response([{
            'id': str(a.id), 'actor': a.actor.full_name if a.actor else 'System', 'action': a.action,
            'entity': a.entity_name, 'entity_id': a.entity_id, 'details': a.details,
            'at': timezone.localtime(a.created_at).isoformat(),
        } for a in AuditLog.objects.select_related('actor').order_by('-created_at')[:100]])
