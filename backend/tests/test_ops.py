"""Production features: DB file storage, scheduler, credit limits, admin console, push, refund fraud, throttling."""
import io
from datetime import datetime, time, timedelta
from decimal import Decimal

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy
from apps.deliveries.models import DailyDelivery
from apps.notifications.models import Notification
from apps.ops import jobs
from apps.ops.models import DeviceToken, JobRun, StoredFile
from apps.subscriptions.models import DeliveryOverride
from apps.wallet import services as ws
from apps.wallet.models import Wallet

JPEG = b'\xff\xd8\xff\xe0' + b'\x00JFIF' + b'\x10' * 9000


def photo():
    return SimpleUploadedFile('p.jpg', JPEG, content_type='image/jpeg')


@pytest.fixture(autouse=True)
def offline(settings):
    settings.NVIDIA_API_KEY = ''
    cache.clear()


@pytest.fixture(scope='module')
def seeded_db(django_db_setup, django_db_blocker):
    from django.test import override_settings
    from apps.portal.management.commands.seed_demo import Command

    with django_db_blocker.unblock(), override_settings(NVIDIA_API_KEY=''):
        call_command('seed_demo', stdout=io.StringIO())
    yield
    with django_db_blocker.unblock():
        Command().wipe()


@pytest.fixture
def seeded(seeded_db, db):
    return None


def client_for(email):
    c = APIClient()
    c.force_authenticate(User.objects.get(email=email))
    return c


def local(hh, mm, day=None):
    day = day or timezone.localdate()
    return timezone.make_aware(datetime.combine(day, time(hh, mm)), timezone.get_current_timezone())


# --- storage -------------------------------------------------------------------------------

def test_uploads_are_stored_in_database_and_served(seeded):
    customer = client_for('customer@gawali.demo')
    delivery_id = customer.get('/api/v2/customer/home/').data['today']['items'][0]['delivery_id']
    before = StoredFile.objects.count()
    r = customer.post('/api/v2/customer/refunds/', {'delivery_id': delivery_id, 'issue': 'leaked', 'photo': photo()}, format='multipart')
    assert r.status_code == 201
    assert StoredFile.objects.count() == before + 1
    url = r.data['claim']['photo']
    assert url.startswith('/media/refunds/')
    got = APIClient().get(url)
    assert got.status_code == 200 and got.content == JPEG and got['Content-Type'] == 'image/jpeg'
    assert APIClient().get('/media/refunds/does-not-exist.jpg').status_code == 404


def test_health_endpoint(db):
    assert APIClient().get('/healthz').json() == {'status': 'ok'}
    r = APIClient().get('/healthz?deep=1')
    assert r.status_code == 200 and r.json()['database'] == 'ok'


# --- credit limit ------------------------------------------------------------------------

def make_debtor(email, amount):
    c = CustomerProfile.objects.get(user__email=email)
    w = Wallet.objects.get(customer=c)
    ws.charge(c, w.balance + Decimal(amount), 'adjustment', 'Test dues')
    return c


def test_over_limit_blocks_add_ons_and_new_plans(seeded):
    c = make_debtor('customer@gawali.demo', 1600)  # limit is 1500
    customer = client_for('customer@gawali.demo')
    home = customer.get('/api/v2/customer/home/').data
    assert home['dues']['over_limit'] and home['dues']['due'] == Decimal('1600.00')
    shop = customer.get('/api/v2/customer/shop/').data
    paneer = next(p for p in shop['all'] if p['name'] == 'Malai Paneer')
    r = customer.post('/api/v2/customer/orders/', {'product_id': paneer['id'], 'quantity': 1, 'date': home['cutoff']['governs_date']}, format='json')
    assert r.status_code == 402 and 'limit' in r.data['message']
    curd = next(p for p in shop['all'] if p['name'] == 'Set Curd')
    assert customer.post('/api/v2/customer/subscriptions/', {'product_id': curd['id']}, format='json').status_code == 402
    # skipping is always allowed
    assert customer.post(f"/api/v2/customer/day/{home['cutoff']['governs_date']}/skip/", {'skip': True}, format='json').status_code == 200
    assert c.id


def test_cutoff_job_holds_debtors_and_payment_releases(seeded):
    dairy = Dairy.objects.get(user__email='gawali@gawali.demo')
    c = make_debtor('rohan@gawali.demo', 2000)
    tomorrow = timezone.localdate() + timedelta(days=1)
    result = jobs.close_tomorrow(local(23, 1), dairy)
    assert result['held'] >= 1
    assert DeliveryOverride.objects.filter(subscription__customer=c, date=tomorrow, quantity=0).exists()
    assert Notification.objects.filter(user=c.user, title__startswith='Delivery on hold').exists()

    owner = client_for('gawali@gawali.demo')
    r = owner.post(f'/api/v2/dairy/customers/{c.id}/payments/', {'amount': 2000, 'method': 'cash'}, format='json')
    assert r.status_code == 201
    dues = owner.get(f'/api/v2/dairy/customers/{c.id}/').data['dues']
    assert not dues['over_limit']
    finance = owner.get('/api/v2/dairy/finance/').data
    assert 'dues' in finance and finance['credit_limit'] == Decimal('1500.00')


def test_dairy_can_change_credit_settings(seeded):
    owner = client_for('gawali@gawali.demo')
    r = owner.patch('/api/v2/dairy/settings/', {'credit_limit': 2500, 'hold_on_dues': False, 'cutoff_reminders': False}, format='json')
    assert r.data['credit_limit'] == Decimal('2500.00') and r.data['hold_on_dues'] is False


# --- scheduler --------------------------------------------------------------------------

def test_jobs_run_once_per_period(seeded):
    now = local(12, 30)
    first = jobs.run_due_jobs(now, only='auto_close_missed')
    assert first and all(r['status'] == 'ok' for r in first)
    assert jobs.run_due_jobs(now, only='auto_close_missed') == []  # locked for today
    assert JobRun.objects.filter(job='auto_close_missed').count() == len(first)
    assert not DailyDelivery.objects.filter(delivery_date=timezone.localdate(), status='pending', scheduled_quantity__gt=0,
                                            subscription__customer__dairy__user__email='gawali@gawali.demo').exists()


def test_jobs_respect_their_time_windows(seeded):
    assert jobs.run_due_jobs(local(2, 0), only='auto_close_missed') == []
    assert jobs.run_due_jobs(local(2, 0), only='morning_routes') == []
    ran = jobs.run_due_jobs(local(4, 50), only='morning_routes')
    assert ran and max(r['partners_notified'] for r in ran) >= 1


def test_cutoff_reminder_and_dues_reminder_jobs(seeded):
    dairy = Dairy.objects.get(user__email='gawali@gawali.demo')
    r = jobs.cutoff_reminder(local(22, 10), dairy)
    assert r['reminded'] > 0
    make_debtor('meera@gawali.demo', 1300)  # near the limit -> reminded any day
    assert jobs.dues_reminders(local(19, 5), dairy)['reminded'] >= 1


def test_scheduler_command_once(seeded):
    out = io.StringIO()
    call_command('run_scheduler', '--once', stdout=out)
    assert 'Gawali scheduler started' in out.getvalue()


# --- admin console ---------------------------------------------------------------------

def test_admin_console_permissions_and_overview(seeded):
    admin = client_for('admin@gawali.demo')
    assert client_for('gawali@gawali.demo').get('/api/v2/admin/overview/').status_code == 403
    o = admin.get('/api/v2/admin/overview/').data
    assert o['users']['customers'] == 14 and o['dairies']['active'] >= 2 and len(o['series']) == 14
    for path in ('dairies', 'users', 'refunds', 'ai', 'jobs', 'audit'):
        assert admin.get(f'/api/v2/admin/{path}/').status_code == 200, path


def test_dairy_signup_needs_admin_approval(seeded):
    c = APIClient()
    r = c.post('/api/v2/auth/signup/', {'role': 'dairy', 'full_name': 'New Owner', 'email': 'newdairy@example.com',
                                        'phone': '+919000011111', 'password': 'Milkman#2026', 'business_name': 'Fresh Valley',
                                        'address': 'Wakad'}, format='json')
    assert r.status_code == 201
    assert 'Fresh Valley' not in [d['name'] for d in c.get('/api/v2/auth/dairies/').data]
    admin = client_for('admin@gawali.demo')
    assert Notification.objects.filter(user__email='admin@gawali.demo', title='New dairy awaiting approval').exists()
    pending = admin.get('/api/v2/admin/dairies/?status=pending').data
    d = next(x for x in pending if x['name'] == 'Fresh Valley')
    assert admin.patch(f"/api/v2/admin/dairies/{d['id']}/", {'is_verified': True}, format='json').data['is_verified']
    assert 'Fresh Valley' in [x['name'] for x in c.get('/api/v2/auth/dairies/').data]
    assert any(a['action'] == 'DAIRY_UPDATE' for a in admin.get('/api/v2/admin/audit/').data)


def test_admin_suspend_user_blocks_login(seeded):
    admin = client_for('admin@gawali.demo')
    u = User.objects.get(email='kavya@gawali.demo')
    assert admin.patch(f'/api/v2/admin/users/{u.id}/', {'is_active': False}, format='json').data['is_active'] is False
    r = APIClient().post('/api/v1/auth/login/', {'email': 'kavya@gawali.demo', 'password': 'Gawali@2026'}, format='json')
    assert r.status_code == 401
    assert admin.patch(f'/api/v2/admin/users/{admin.handler._force_user.id}/', {'is_active': False}, format='json').status_code == 400


def test_admin_broadcast(seeded):
    admin = client_for('admin@gawali.demo')
    r = admin.post('/api/v2/admin/broadcast/', {'audience': 'delivery_boy', 'title': 'Diwali schedule', 'body': 'Routes start 30 min late.'}, format='json')
    assert r.status_code == 201 and r.data['recipients'] == 2
    assert Notification.objects.filter(title='Diwali schedule').count() == 2


def test_admin_can_trigger_job(seeded):
    r = client_for('admin@gawali.demo').post('/api/v2/admin/jobs/', {'job': 'manifest_today'}, format='json')
    assert r.status_code == 200


# --- push --------------------------------------------------------------------------------

def test_push_config_and_device_registration(seeded):
    cfg = APIClient().get('/api/v2/push/config/').data
    assert cfg['enabled'] is False and cfg['server_ready'] is False
    customer = client_for('customer@gawali.demo')
    assert customer.post('/api/v2/devices/', {'token': 'x' * 40, 'platform': 'web'}, format='json').status_code == 201
    assert DeviceToken.objects.filter(user__email='customer@gawali.demo', is_active=True).count() == 1
    assert customer.post('/api/v2/devices/', {'token': 'short'}, format='json').status_code == 400
    assert customer.delete('/api/v2/devices/', {'token': 'x' * 40}, format='json').status_code == 204


def test_push_send_skips_cleanly_without_credentials(seeded):
    from apps.ops import push
    u = User.objects.get(email='customer@gawali.demo')
    DeviceToken.objects.create(user=u, token='y' * 40)
    assert push.send_to_users([u.id], 'Hi', 'There')['skipped'] == 'push not configured'


# --- refund fraud ------------------------------------------------------------------------

def test_ai_outage_never_auto_credits(seeded, settings, monkeypatch):
    from apps.assistant import nvidia
    settings.NVIDIA_API_KEY = 'nvapi-test'
    monkeypatch.setattr(nvidia, 'chat_json', lambda *a, **k: None)  # model timed out
    customer = client_for('rohan@gawali.demo')
    item = next(i for i in customer.get('/api/v2/customer/home/').data['today']['items'] if i.get('delivery_status') == 'delivered')
    r = customer.post('/api/v2/customer/refunds/', {'delivery_id': item['delivery_id'], 'issue': 'curdled', 'photo': photo()}, format='multipart')
    assert r.status_code == 201 and r.data['claim']['status'] == 'under_review'


def test_refund_velocity_limit(seeded):
    from apps.refunds.models import RefundClaim
    c = CustomerProfile.objects.get(user__email='isha@gawali.demo')
    deliveries = list(DailyDelivery.objects.filter(subscription__customer=c, status='delivered').order_by('-delivery_date')[:4])
    for d in deliveries[1:]:
        RefundClaim.objects.create(customer=c, delivery=d, issue='leaked', amount=10, status='credited', ai_verdict='verified')
    customer = client_for('isha@gawali.demo')
    today_item = next((i for i in customer.get('/api/v2/customer/home/').data['today']['items'] if i.get('delivery_status') == 'delivered'), None)
    if today_item is None:
        pytest.skip('no delivery today for this household')
    r = customer.post('/api/v2/customer/refunds/', {'delivery_id': today_item['delivery_id'], 'issue': 'leaked', 'photo': photo()}, format='multipart')
    assert r.data['claim']['status'] == 'under_review'


# --- throttling ---------------------------------------------------------------------------

def test_login_is_rate_limited(db, settings, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle
    rates = {**settings.REST_FRAMEWORK['DEFAULT_THROTTLE_RATES'], 'login': '3/min'}
    monkeypatch.setattr(ScopedRateThrottle, 'THROTTLE_RATES', rates)
    c = APIClient()
    codes = [c.post('/api/v1/auth/login/', {'email': 'nobody@x.com', 'password': 'wrong'}, format='json').status_code for _ in range(5)]
    assert 429 in codes


def test_cleanup_job_and_failed_job_retry(seeded, monkeypatch):
    first = jobs.run_due_jobs(local(3, 30), only='cleanup')
    assert first and first[0]['status'] == 'ok', first

    calls = {'n': 0}

    def flaky(now, dairy):
        calls['n'] += 1
        if calls['n'] == 1:
            raise RuntimeError('transient outage')
        return {'ok': True}

    monkeypatch.setattr(jobs, 'JOBS', [jobs.Job('flaky', 'test', lambda n, d: True, flaky, per_dairy=False)])
    assert jobs.run_due_jobs(local(9, 0))[0]['status'] == 'failed'
    retry = jobs.run_due_jobs(local(9, 1))
    assert retry[0]['status'] == 'ok' and retry[0]['attempts'] == 2
    assert jobs.run_due_jobs(local(9, 2)) == []  # succeeded: not run again today


def test_scheduler_skips_database_when_nothing_is_due(seeded, monkeypatch):
    """Between jobs the loop must not query the database, so a serverless DB can scale to zero."""
    from apps.dairies.models import Dairy
    from apps.ops.management.commands.run_scheduler import Command

    dairies = list(Dairy.objects.filter(is_active=True))
    early = local(2, 0)  # at 02:00: today's manifest, plus the cutoff job's catch-up for last night
    due_early = Command._due(early, dairies, None, set())
    assert {j for j, _ in due_early} == {'manifest_today', 'close_tomorrow'}
    yesterday = (early - timedelta(days=1)).date().isoformat()
    assert all(p.startswith(yesterday) for j, p in due_early if j == 'close_tomorrow')  # counted against last night
    assert Command._due(early, dairies, None, due_early) == set()  # once handled, ticks need no DB
    busy = local(12, 5)
    due = Command._due(busy, dairies, None, set())
    assert ('auto_close_missed', jobs.period_for(busy, dairies[0])) in due
    assert Command._due(busy, dairies, None, due) == set()  # already handled: no DB work


def test_cron_tick_requires_secret_and_runs_jobs(seeded, settings):
    settings.CRON_SECRET = 'tick-secret-123'
    c = APIClient()
    assert c.get('/api/v2/cron/tick/').status_code == 403
    assert c.get('/api/v2/cron/tick/', HTTP_AUTHORIZATION='Bearer wrong').status_code == 403
    r = c.get('/api/v2/cron/tick/', HTTP_AUTHORIZATION='Bearer tick-secret-123')
    assert r.status_code == 200 and 'ran' in r.data
    settings.CRON_SECRET = ''
    assert c.get('/api/v2/cron/tick/', HTTP_AUTHORIZATION='Bearer ').status_code == 403  # never open without a secret
