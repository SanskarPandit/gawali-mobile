"""End-to-end checks of the v2 (Gawali) API for all three roles, on the seeded demo data."""
import io
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.customers.models import CustomerProfile
from apps.deliveries.models import DailyDelivery
from apps.wallet.models import Wallet, WalletTransaction
from apps.wallet.services import bottles_with_customer

FAKE_JPEG = b'\xff\xd8\xff\xe0' + b'\x00JFIF' + b'\x10' * 9000


def photo(name='p.jpg'):
    return SimpleUploadedFile(name, FAKE_JPEG, content_type='image/jpeg')


@pytest.fixture(scope='module')
def media_root(tmp_path_factory):
    return tmp_path_factory.mktemp('media')


@pytest.fixture(autouse=True)
def offline_ai(settings, media_root):
    settings.NVIDIA_API_KEY = ''
    settings.MEDIA_ROOT = media_root


@pytest.fixture(scope='module')
def seeded_db(django_db_setup, django_db_blocker, media_root):
    """Seed once per module; each test still runs in its own rolled-back transaction."""
    from django.test import override_settings
    from apps.portal.management.commands.seed_demo import Command

    with django_db_blocker.unblock(), override_settings(MEDIA_ROOT=media_root, NVIDIA_API_KEY=''):
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


@pytest.fixture
def customer(seeded):
    return client_for('customer@gawali.demo')


@pytest.fixture
def dairy(seeded):
    return client_for('gawali@gawali.demo')


@pytest.fixture
def partner(seeded):
    return client_for('delivery@gawali.demo')


def test_login_and_signup(seeded):
    c = APIClient()
    r = c.post('/api/v1/auth/login/', {'email': 'customer@gawali.demo', 'password': 'Gawali@2026'}, format='json')
    assert r.status_code == 200 and r.data['user']['role'] == 'customer'

    dairies = c.get('/api/v2/auth/dairies/').data
    assert {d['name'] for d in dairies} >= {'Sangamner Valley Dairy', 'Mulshi Organic Farms'}
    r = c.post('/api/v2/auth/signup/', {
        'role': 'customer', 'full_name': 'New Person', 'email': 'new@example.com', 'phone': '+919000000999',
        'password': 'Milkman#2026', 'dairy_id': dairies[0]['id'], 'address': '12 MG Road',
    }, format='json')
    assert r.status_code == 201, r.data
    assert CustomerProfile.objects.get(user__email='new@example.com').wallet.balance == 0

    r = c.post('/api/v2/auth/signup/', {
        'role': 'dairy', 'full_name': 'Owner', 'email': 'owner@example.com', 'phone': '+919000000998',
        'password': 'Milkman#2026', 'business_name': 'Fresh Farms', 'address': 'Wakad',
    }, format='json')
    assert r.status_code == 201 and r.data['user']['role'] == 'dairy'

    r = c.post('/api/v2/auth/signup/', {'role': 'delivery_boy', 'full_name': 'X', 'email': 'x@e.com', 'phone': '1',
                                         'password': 'Milkman#2026'}, format='json')
    assert r.status_code == 400


def test_roles_are_isolated(customer, dairy, partner):
    assert customer.get('/api/v2/dairy/overview/').status_code == 403
    assert partner.get('/api/v2/customer/home/').status_code == 403
    assert dairy.get('/api/v2/delivery/route/').status_code == 403


def test_customer_home_and_day_edits(customer):
    home = customer.get('/api/v2/customer/home/').data
    assert home['tomorrow']['items'] and len(home['week']) == 7
    assert home['today']['status'] == 'delivered'
    assert home['bottles']['with_you'] == 3
    target = home['cutoff']['governs_date']
    line = home['tomorrow']['items'][0]

    r = customer.post(f'/api/v2/customer/day/{target}/quantity/', {'subscription_id': line['subscription_id'], 'quantity': 3}, format='json')
    assert r.status_code == 200, r.data
    assert Decimal(str(r.data['items'][0]['quantity'])) == 3 and r.data['items'][0]['is_override']

    r = customer.post(f'/api/v2/customer/day/{target}/skip/', {'skip': True}, format='json')
    assert r.data['status'] == 'skipped'
    r = customer.post(f'/api/v2/customer/day/{target}/skip/', {'skip': False}, format='json')
    assert r.data['status'] == 'scheduled'

    yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()
    r = customer.post(f'/api/v2/customer/day/{yesterday}/skip/', {'skip': True}, format='json')
    assert r.status_code == 400 and 'closed' in r.data['message'].lower()


def test_swap_variant_and_add_on(customer):
    home = customer.get('/api/v2/customer/home/').data
    target = home['cutoff']['governs_date']
    shop = customer.get('/api/v2/customer/shop/').data
    assert shop['recommended']['items'] and shop['top_buys'] and shop['reorder'] and shop['new_in']
    assert shop['recommended']['engine'] == 'rules'
    buffalo = next(p for p in shop['all'] if p['name'] == 'Buffalo Milk')
    line = home['tomorrow']['items'][0]
    r = customer.post(f'/api/v2/customer/day/{target}/swap/', {'subscription_id': line['subscription_id'], 'product_id': buffalo['id']}, format='json')
    assert r.status_code == 200, r.data
    assert r.data['items'][0]['quantity'] == 0 and r.data['orders'][0]['product']['name'] == 'Buffalo Milk'

    paneer = next(p for p in shop['all'] if p['name'] == 'Malai Paneer')
    r = customer.post('/api/v2/customer/orders/', {'product_id': paneer['id'], 'quantity': 1, 'date': target}, format='json')
    assert r.status_code == 201
    assert customer.post(f"/api/v2/customer/orders/{r.data['id']}/cancel/").status_code == 200


def test_vacation_preview_and_create(customer):
    home = customer.get('/api/v2/customer/home/').data
    start = date.fromisoformat(home['cutoff']['governs_date']) + timedelta(days=3)
    end = start + timedelta(days=4)
    p = customer.get('/api/v2/customer/vacations/preview/', {'start_date': start, 'end_date': end}).data
    assert p['days'] == 5 and p['savings'] > 0 and 'resume' in p['message']
    r = customer.post('/api/v2/customer/vacations/', {'start_date': start.isoformat(), 'end_date': end.isoformat()}, format='json')
    assert r.status_code == 201
    week = customer.get('/api/v2/customer/week/', {'start': start.isoformat(), 'days': 5}).data
    assert {d['status'] for d in week} == {'vacation'}
    assert customer.post('/api/v2/customer/vacations/', {'start_date': start.isoformat(), 'end_date': end.isoformat()}, format='json').status_code == 400
    assert customer.delete(f"/api/v2/customer/vacations/{r.data['id']}/").status_code == 204


def test_subscriptions_crud(customer):
    shop = customer.get('/api/v2/customer/shop/').data
    curd = next(p for p in shop['all'] if p['name'] == 'Set Curd')
    r = customer.post('/api/v2/customer/subscriptions/', {'product_id': curd['id'], 'quantity': 1}, format='json')
    assert r.status_code == 201
    assert customer.post('/api/v2/customer/subscriptions/', {'product_id': curd['id']}, format='json').status_code == 400
    r = customer.patch(f"/api/v2/customer/subscriptions/{r.data['id']}/", {'status': 'paused'}, format='json')
    assert r.data['status'] == 'paused'
    r = customer.patch(f"/api/v2/customer/subscriptions/{r.data['id']}/", {'status': 'cancelled'}, format='json')
    assert r.data['status'] == 'cancelled'


def test_payments_off_blocks_gateway_and_dairy_records_cash(customer, dairy):
    w = customer.get('/api/v2/customer/wallet/').data
    assert w['payments_enabled'] is False
    assert customer.post('/api/v2/customer/wallet/topup/', {'amount': 500, 'upi_id': 'a@okhdfc'}, format='json').status_code == 400
    assert customer.post('/api/v2/customer/wallet/withdraw/', {'amount': 10, 'destination': 'a@okhdfc'}, format='json').status_code == 400
    assert customer.patch('/api/v2/customer/wallet/', {'billing_mode': 'autopay'}, format='json').status_code == 400
    assert not Wallet.objects.filter(billing_mode='autopay').exists()

    cust = CustomerProfile.objects.get(user__email='customer@gawali.demo')
    before = Decimal(str(w['balance']))
    r = dairy.post(f'/api/v2/dairy/customers/{cust.id}/payments/', {'amount': 300, 'method': 'cash'}, format='json')
    assert r.status_code == 201 and Decimal(str(r.data['balance'])) == before + 300
    assert 'Payment received by dairy' in r.data['description']


def test_wallet_topup_withdraw_and_autopay(customer, settings):
    settings.PAYMENTS_ENABLED = True
    w = customer.get('/api/v2/customer/wallet/').data
    start = Decimal(str(w['balance']))
    assert w['burn']['daily_average'] > 0 and w['transactions']
    r = customer.post('/api/v2/customer/wallet/topup/', {'amount': 500, 'upi_id': 'ananya@okhdfcbank'}, format='json')
    assert r.status_code == 201 and Decimal(str(r.data['wallet']['balance'])) == start + 500
    assert customer.post('/api/v2/customer/wallet/topup/', {'amount': 5, 'upi_id': 'a@b'}, format='json').status_code == 400
    r = customer.post('/api/v2/customer/wallet/withdraw/', {'amount': 100, 'destination': 'ananya@okhdfcbank'}, format='json')
    assert Decimal(str(r.data['wallet']['balance'])) == start + 400
    assert customer.post('/api/v2/customer/wallet/withdraw/', {'amount': 999999, 'destination': 'x@ok'}, format='json').status_code == 400

    assert customer.patch('/api/v2/customer/wallet/', {'billing_mode': 'autopay'}, format='json').status_code == 400
    r = customer.patch('/api/v2/customer/wallet/', {'autopay_upi_id': 'ananya@okicici', 'billing_mode': 'autopay'}, format='json')
    assert r.data['billing_mode'] == 'autopay' and r.data['autopay_status'] == 'active'


def test_passport_hidden_by_default(customer):
    assert customer.get('/api/v2/customer/passport/').status_code == 404
    assert customer.get('/api/v2/customer/home/').data['passport_enabled'] is False


def test_passport_and_pdf(customer, dairy, settings):
    settings.PASSPORT_ENABLED = True
    p = customer.get('/api/v2/customer/passport/').data
    assert p['cold_chain_ok'] and p['lab']['adulteration_free'] and len(p['temperature_log']) > 4
    assert 2.8 <= p['temp_min'] and p['temp_max'] <= 4.2
    r = customer.get(f"/api/v2/batches/{p['id']}/pdf/")
    assert r.status_code == 200 and r['Content-Type'] == 'application/pdf' and r.content[:4] == b'%PDF'
    assert dairy.get(f"/api/v2/batches/{p['id']}/pdf/").status_code == 200


def test_instant_refund_and_backup(customer):
    home = customer.get('/api/v2/customer/home/').data
    delivery_id = home['today']['items'][0]['delivery_id']
    before = Decimal(str(home['wallet']['balance']))
    r = customer.post('/api/v2/customer/refunds/', {'delivery_id': delivery_id, 'issue': 'leaked', 'photo': photo()}, format='multipart')
    assert r.status_code == 201, r.data
    assert r.data['claim']['status'] == 'credited' and r.data['claim']['processing_ms'] < 5000
    assert Decimal(str(r.data['wallet_balance'])) == before + Decimal(str(r.data['claim']['amount']))
    again = customer.post('/api/v2/customer/refunds/', {'delivery_id': delivery_id, 'issue': 'leaked', 'photo': photo()}, format='multipart')
    assert again.status_code == 409
    r = customer.post(f"/api/v2/customer/refunds/{r.data['claim']['id']}/backup/")
    assert r.status_code == 201 and r.data['eta_label']


def test_assistant_offline_rules_and_apply(customer):
    r = customer.post('/api/v2/customer/assistant/', {'messages': [{'role': 'user', 'content': 'Please skip tomorrow'}]}, format='json')
    assert r.data['engine'] == 'rules' and r.data['actions'][0]['type'] == 'skip_day'
    r = customer.post('/api/v2/customer/assistant/apply/', {'action': r.data['actions'][0]}, format='json')
    assert r.status_code == 200 and r.data['success']
    r = customer.post('/api/v2/customer/assistant/', {'messages': [{'role': 'user', 'content': 'what is my wallet balance'}]}, format='json')
    assert '₹' in r.data['reply']


def test_profile_doorstep_toggles(customer):
    r = customer.patch('/api/v2/customer/profile/', {'silent_delivery': False, 'use_gate_hook': True}, format='json')
    assert r.data['silent_delivery'] is False and r.data['use_gate_hook'] is True
    assert customer.get('/api/v2/customer/bottles/').data['with_you'] == 3


def test_dairy_dashboard_endpoints(dairy):
    o = dairy.get('/api/v2/dairy/overview/').data
    assert o['kpis']['active_households'] == 14 and len(o['series']) == 14 and o['demand_tomorrow']
    assert dairy.get('/api/v2/dairy/insights/').data['items']
    m = dairy.get('/api/v2/dairy/manifest/').data
    assert m['stops'] and m['load_sheet'] and m['routes']
    assert len(dairy.get('/api/v2/dairy/customers/').data) == 14
    assert dairy.get('/api/v2/dairy/finance/').data['collected'] > 0
    assert dairy.get('/api/v2/dairy/refunds/').data['stats']['claims'] == 2
    assert len(dairy.get('/api/v2/dairy/batches/').data) > 10
    assert dairy.get('/api/v2/dairy/settings/').data['cutoff_time'] == '23:00'


def test_dairy_management_flows(dairy):
    routes = dairy.get('/api/v2/dairy/routes/').data
    r = dairy.post('/api/v2/dairy/products/', {'name': 'Kesar Shrikhand', 'unit': '250 g', 'price': 120, 'category': 'curd',
                                               'container': 'tub', 'is_new': True}, format='json')
    assert r.status_code == 201, r.data
    pid = r.data['id']
    assert dairy.patch(f'/api/v2/dairy/products/{pid}/', {'price': 125}, format='json').data['price'] == 125
    r = dairy.post('/api/v2/dairy/customers/', {'full_name': 'Ritu Sharma', 'email': 'ritu@example.com', 'phone': '+919700000001',
                                                'address': 'Baner', 'route_id': routes[0]['id'], 'product_id': pid,
                                                'quantity': 1, 'opening_balance': 1000}, format='json')
    assert r.status_code == 201 and r.data['temporary_password'] and r.data['wallet_balance'] == 1000
    detail = dairy.get(f"/api/v2/dairy/customers/{r.data['id']}/").data
    assert detail['subscriptions'][0]['product']['name'] == 'Kesar Shrikhand'

    r = dairy.post('/api/v2/dairy/partners/', {'full_name': 'Omkar', 'email': 'omkar@example.com', 'phone': '+919700000002',
                                               'route_id': routes[1]['id']}, format='json')
    assert r.status_code == 201 and r.data['temporary_password']
    login = APIClient().post('/api/v1/auth/login/', {'email': 'omkar@example.com', 'password': r.data['temporary_password']}, format='json')
    assert login.status_code == 200

    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    r = dairy.post('/api/v2/dairy/batches/', {'delivery_date': tomorrow, 'fat_percent': 4.1, 'snf_percent': 8.7, 'animal': 'cow'}, format='json')
    assert r.status_code == 201 and r.data['status'] == 'passed' and r.data['cold_chain_ok']
    r = dairy.post('/api/v2/dairy/batches/', {'delivery_date': tomorrow, 'fat_percent': 4.1, 'snf_percent': 8.7, 'water_percent': 2}, format='json')
    assert r.data['status'] == 'failed'

    claim = next(c for c in dairy.get('/api/v2/dairy/refunds/').data['claims'] if c['status'] == 'under_review')
    r = dairy.post(f"/api/v2/dairy/refunds/{claim['id']}/decision/", {'approve': True}, format='json')
    assert r.data['status'] == 'credited'

    assert dairy.patch('/api/v2/dairy/settings/', {'cutoff_time': '22:30'}, format='json').data['cutoff_time'] == '22:30'


def test_partner_route_and_stop_completion(partner):
    route = partner.get('/api/v2/delivery/route/').data
    assert route['stops'] and route['load_sheet'] and route['progress']['total'] == len(route['stops'])
    pending = next(s for s in route['stops'] if s['status'] == 'pending')
    customer = CustomerProfile.objects.get(id=pending['customer_id'])
    bottles_before = bottles_with_customer(customer)
    txns_before = WalletTransaction.objects.filter(wallet__customer=customer).count()

    r = partner.post(f"/api/v2/delivery/stops/{pending['customer_id']}/complete/", {'outcome': 'delivered'}, format='multipart')
    assert r.status_code == 400 and 'photo' in r.data['errors']

    r = partner.post(f"/api/v2/delivery/stops/{pending['customer_id']}/complete/",
                     {'outcome': 'delivered', 'photo': photo(), 'bottles_returned': bottles_before, 'pouches_returned': 10},
                     format='multipart')
    assert r.status_code == 200, r.data
    assert r.data['charged'] > 0 and r.data['photo']
    assert WalletTransaction.objects.filter(wallet__customer=customer).count() > txns_before
    assert DailyDelivery.objects.filter(subscription__customer=customer, delivery_date=timezone.localdate(),
                                        status='delivered').exists()
    again = partner.post(f"/api/v2/delivery/stops/{pending['customer_id']}/complete/", {'outcome': 'delivered', 'photo': photo()}, format='multipart')
    assert again.status_code == 409

    other = next(s for s in partner.get('/api/v2/delivery/route/').data['stops'] if s['status'] == 'pending')
    r = partner.post(f"/api/v2/delivery/stops/{other['customer_id']}/complete/", {'outcome': 'missed'}, format='multipart')
    assert r.data['outcome'] == 'missed'
    assert partner.post(f"/api/v2/delivery/stops/{other['customer_id']}/reopen/").status_code == 200

    assert partner.get('/api/v2/delivery/brief/').data['text'].startswith('•')
    assert len(partner.get('/api/v2/delivery/history/').data['days']) == 14


def test_partner_cannot_touch_other_routes(partner):
    other_route = CustomerProfile.objects.filter(delivery_route__name='Aundh – Pashan').first()
    r = partner.post(f'/api/v2/delivery/stops/{other_route.id}/complete/', {'outcome': 'delivered'}, format='multipart')
    assert r.status_code == 404


def test_autopay_charges_do_not_touch_balance(seeded, settings):
    from apps.wallet import services as ws

    settings.PAYMENTS_ENABLED = True
    w = Wallet.objects.select_related('customer').first()
    w.billing_mode, w.autopay_status, w.autopay_upi_id = 'autopay', 'active', 'x@okhdfc'
    w.save()
    before = w.balance
    t = ws.charge(w.customer, Decimal('92'), 'delivery', 'A2 milk')
    w.refresh_from_db()
    assert t.channel == 'autopay' and w.balance == before

    settings.PAYMENTS_ENABLED = False  # gateway off: the same charge lands in the ledger instead
    t = ws.charge(w.customer, Decimal('92'), 'delivery', 'A2 milk')
    w.refresh_from_db()
    assert t.channel == 'wallet' and w.balance == before - 92


def test_lab_report_parse_requires_key_offline(dairy):
    r = dairy.post('/api/v2/dairy/batches/parse-report/', {'report': photo('lab.jpg')}, format='multipart')
    assert r.status_code == 400 and 'NVIDIA' in r.data['errors']['report'][0]


def test_ai_status_lists_a_model_per_task(dairy, settings):
    settings.NVIDIA_API_KEY = 'nvapi-test'
    tasks = {t['task']: t['model'] for t in dairy.get('/api/v2/ai/status/').data['tasks']}
    assert set(tasks) == {'chat', 'vision', 'insight', 'parse'} and len(set(tasks.values())) == 4
