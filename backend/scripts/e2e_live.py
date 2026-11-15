"""
Live end-to-end test against a running server (default http://127.0.0.1:8000), for all four roles.

It creates an isolated tenant (an "E2E" dairy, its households and partner), exercises every section over
HTTP exactly as the web app does, then deletes everything it created. Demo data is only read, never changed.

    python scripts/e2e_live.py [base_url]
"""
import io
import os
import sys
import time
import uuid
from datetime import date, timedelta

import requests

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.production')
import django  # noqa: E402

django.setup()
from django.utils import timezone  # noqa: E402

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://127.0.0.1:8000').rstrip('/')
RUN = uuid.uuid4().hex[:6]
OWNER_EMAIL = f'e2e-owner-{RUN}@e2e.gawali.test'
PW = 'E2e#Milk2026'
results = []


def check(name, cond, detail=''):
    results.append((name, bool(cond), detail))
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + (f'  [{detail}]' if detail and not cond else ''))
    return cond


class Client:
    def __init__(self, token=None):
        self.s = requests.Session()
        self.token = token

    def call(self, method, path, **kw):
        headers = kw.pop('headers', {})
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        t = time.time()
        r = self.s.request(method, BASE + path, headers=headers, timeout=60, **kw)
        r.elapsed_s = time.time() - t
        try:
            r.data = r.json()
        except ValueError:
            r.data = None
        return r

    def get(self, p, **kw): return self.call('GET', p, **kw)
    def post(self, p, json=None, **kw): return self.call('POST', p, json=json, **kw)
    def patch(self, p, json): return self.call('PATCH', p, json=json)
    def delete(self, p, json=None): return self.call('DELETE', p, json=json)


def login(email, password):
    r = Client().post('/api/v1/auth/login/', {'email': email, 'password': password})
    return Client(r.data['access']) if r.status_code == 200 else None


def jpeg_bytes(kind='leak'):
    from PIL import Image, ImageDraw
    img = Image.new('RGB', (900, 680), (196, 186, 170))
    d = ImageDraw.Draw(img)
    if kind == 'leak':
        d.rectangle([280, 120, 620, 520], fill=(246, 246, 242), outline=(170, 165, 155), width=5)
        d.polygon([(420, 520), (300, 660), (640, 660), (520, 520)], fill=(252, 252, 250))
        d.line([(430, 380), (470, 450), (440, 515)], fill=(110, 100, 90), width=8)
    import random
    rnd = random.Random(7)
    for _ in range(25000):  # sensor noise, like a real phone photo
        x, y = rnd.randrange(900), rnd.randrange(680)
        r0, g0, b0 = img.getpixel((x, y))
        n = rnd.randint(-18, 18)
        img.putpixel((x, y), (max(0, min(255, r0 + n)), max(0, min(255, g0 + n)), max(0, min(255, b0 + n))))
    buf = io.BytesIO()
    img.save(buf, 'JPEG', quality=85)
    return buf.getvalue()


def lab_png():
    from PIL import Image, ImageDraw, ImageFont
    try:
        f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 30)
    except OSError:
        f = ImageFont.load_default()
    img = Image.new('RGB', (900, 560), 'white')
    d = ImageDraw.Draw(img)
    for i, line in enumerate(['Quality Test Certificate', f'Batch: E2E{RUN.upper()}-A', 'Fat (%): 4.10', 'SNF (%): 8.70',
                              'Added water (%): 0.00', 'Detergent: Negative', 'Starch: Negative', 'Urea: Negative']):
        d.text((50, 40 + i * 62), line, fill='black', font=f)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue()


def section(title):
    print(f'\n== {title}')


def main():
    t0 = time.time()
    anon = Client()

    section('Infrastructure')
    r = anon.get('/healthz?deep=1')
    check('health check reports database ok', r.status_code == 200 and r.data.get('database') == 'ok', r.text[:100])
    r = anon.get('/login')
    check('web app served at /login (SPA)', r.status_code == 200 and '<div id="root">' in r.text)
    check('security headers present', r.headers.get('X-Frame-Options') == 'DENY' and r.headers.get('X-Content-Type-Options') == 'nosniff',
          str({k: v for k, v in r.headers.items() if k.lower().startswith('x-')}))
    asset = next((p for p in r.text.split('"') if p.startswith('/assets/') and p.endswith('.js')), None)
    check('static JS bundle served', asset and anon.get(asset).status_code == 200, asset or 'no asset link')
    check('API docs hidden from the public', anon.get('/api/docs/').status_code in (401, 403))
    r = anon.get('/api/v2/config/')
    check('payments off, passport hidden', r.data == {'payments_enabled': False, 'passport_enabled': False}, str(r.data))
    check('push config endpoint responds', anon.get('/api/v2/push/config/').status_code == 200)
    check('unauthenticated API is rejected', anon.get('/api/v2/customer/home/').status_code == 401)

    section('Auth & roles')
    admin = login('admin@gawali.demo', 'Gawali@2026')
    check('admin can sign in', admin is not None)
    demo_customer = login('customer@gawali.demo', 'Gawali@2026')
    check('demo customer can sign in', demo_customer is not None)
    check('wrong password rejected', Client().post('/api/v1/auth/login/', {'email': 'customer@gawali.demo', 'password': 'nope'}).status_code == 401)
    owner_email = OWNER_EMAIL
    r = anon.post('/api/v2/auth/signup/', {'role': 'dairy', 'full_name': 'E2E Owner', 'email': owner_email, 'phone': f'+9177{RUN[:4].encode().hex()[:8]}',
                                          'password': PW, 'business_name': f'E2E Dairy {RUN}', 'address': 'Test Lane, Pune', 'city': 'Pune'})
    check('dairy owner can sign up', r.status_code == 201, r.text[:150])
    owner = Client(r.data['access'])
    public = [d['name'] for d in anon.get('/api/v2/auth/dairies/').data]
    check('new dairy hidden until approved', f'E2E Dairy {RUN}' not in public)
    check('owner sees awaiting-approval state', owner.get('/api/v2/dairy/settings/').data['is_verified'] is False)
    check('non-admin cannot open admin API', owner.get('/api/v2/admin/overview/').status_code == 403)

    section('Admin console')
    o = admin.get('/api/v2/admin/overview/')
    check('overview loads', o.status_code == 200 and 'users' in o.data, f'{o.elapsed_s:.1f}s')
    pending = admin.get('/api/v2/admin/dairies/?status=pending').data
    mine = next((d for d in pending if d['name'] == f'E2E Dairy {RUN}'), None)
    check('new dairy appears in pending list', mine is not None)
    r = admin.patch(f"/api/v2/admin/dairies/{mine['id']}/", {'is_verified': True})
    check('admin approves dairy', r.status_code == 200 and r.data['is_verified'])
    check('approved dairy is public', f'E2E Dairy {RUN}' in [d['name'] for d in anon.get('/api/v2/auth/dairies/').data])
    for p in ('users', 'refunds', 'ai', 'jobs', 'audit'):
        check(f'admin {p} page data loads', admin.get(f'/api/v2/admin/{p}/').status_code == 200)

    section('Dairy setup (catalog, routes, team, settings)')
    milk = owner.post('/api/v2/dairy/products/', {'name': 'E2E Cow Milk', 'unit': '1 L', 'price': 70, 'category': 'milk', 'container': 'glass_bottle', 'animal': 'cow', 'kind': 'subscription'})
    check('create milk product', milk.status_code == 201, milk.text[:120])
    curd = owner.post('/api/v2/dairy/products/', {'name': 'E2E Curd', 'unit': '400 g', 'price': 40, 'category': 'curd', 'container': 'tub', 'kind': 'one_time', 'is_new': True})
    check('create add-on product', curd.status_code == 201)
    check('edit product price', owner.patch(f"/api/v2/dairy/products/{curd.data['id']}/", {'price': 42}).data['price'] == 42)
    check('invalid product rejected', owner.post('/api/v2/dairy/products/', {'name': '', 'unit': '', 'price': 0}).status_code == 400)
    route = owner.post('/api/v2/dairy/routes/', {'name': f'E2E Route {RUN}'})
    check('create route', route.status_code == 201)
    s = owner.patch('/api/v2/dairy/settings/', {'cutoff_time': '23:30', 'credit_limit': 500, 'hold_on_dues': True, 'hub_name': 'E2E Hub'})
    check('update delivery rules & credit limit', s.status_code == 200 and s.data['credit_limit'] == 500)
    partner_email = f'e2e-partner-{RUN}@e2e.gawali.test'
    p = owner.post('/api/v2/dairy/partners/', {'full_name': 'E2E Partner', 'email': partner_email, 'phone': f'+9166{RUN.encode().hex()[:8]}', 'route_id': route.data['id'], 'vehicle_number': 'MH12E2E'})
    check('invite delivery partner (gets temp password)', p.status_code == 201 and p.data.get('temporary_password'), p.text[:150])
    partner = login(partner_email, p.data['temporary_password'])
    check('partner signs in with temp password', partner is not None)
    r = owner.patch(f"/api/v2/dairy/partners/{p.data['id']}/", {'reset_password': True})
    check('reset partner password', r.status_code == 200 and r.data.get('temporary_password'))
    partner = login(partner_email, r.data['temporary_password'])
    check('partner signs in with new password', partner is not None)

    section('Households & customer signup')
    hh_email = f'e2e-home-{RUN}@e2e.gawali.test'
    hh = owner.post('/api/v2/dairy/customers/', {'full_name': 'E2E Household', 'email': hh_email, 'phone': f'+9155{RUN.encode().hex()[:8]}',
                                                 'address': '1 Test Street', 'flat': 'A-1', 'society_name': 'E2E Society', 'route_id': route.data['id'],
                                                 'product_id': milk.data['id'], 'quantity': 2})
    check('dairy adds a household with a plan', hh.status_code == 201 and hh.data.get('temporary_password'), hh.text[:150])
    household = login(hh_email, hh.data['temporary_password'])
    check('household signs in', household is not None)
    dairies = anon.get('/api/v2/auth/dairies/').data
    e2e_dairy_id = next(d['id'] for d in dairies if d['name'] == f'E2E Dairy {RUN}')
    self_email = f'e2e-self-{RUN}@e2e.gawali.test'
    r = anon.post('/api/v2/auth/signup/', {'role': 'customer', 'full_name': 'E2E Selfsignup', 'email': self_email, 'phone': f'+9144{RUN.encode().hex()[:8]}',
                                          'password': PW, 'dairy_id': e2e_dairy_id, 'address': '2 Test Street', 'society_name': 'E2E Society'})
    check('customer self-signup', r.status_code == 201, r.text[:150])
    selfc = Client(r.data['access'])
    check('duplicate email rejected', anon.post('/api/v2/auth/signup/', {'role': 'customer', 'full_name': 'X', 'email': self_email, 'phone': '+910000000001', 'password': PW,
                                                                        'dairy_id': e2e_dairy_id, 'address': 'x'}).status_code == 400)
    check('weak password rejected', anon.post('/api/v2/auth/signup/', {'role': 'customer', 'full_name': 'X', 'email': f'w{RUN}@e2e.gawali.test', 'phone': '+910000000002',
                                                                      'password': '123', 'dairy_id': e2e_dairy_id, 'address': 'x'}).status_code == 400)
    lst = owner.get('/api/v2/dairy/customers/').data
    check('dairy sees both households', {c['name'] for c in lst} >= {'E2E Household', 'E2E Selfsignup'})
    hh_id = hh.data['id']
    check('edit household (stop order)', owner.patch(f'/api/v2/dairy/customers/{hh_id}/', {'stop_order': 1}).status_code == 200)
    check('household detail loads', owner.get(f'/api/v2/dairy/customers/{hh_id}/').status_code == 200)

    section('Customer: home, calendar, plan')
    h = household.get('/api/v2/customer/home/')
    check('home loads', h.status_code == 200 and not h.data['needs_onboarding'], f'{h.elapsed_s:.1f}s')
    target = h.data['cutoff']['governs_date']
    check('cutoff countdown present', h.data['cutoff']['next_cutoff_at'])
    check('7-day ribbon', len(h.data['week']) == 7)
    sub_id = household.get('/api/v2/customer/subscriptions/').data[0]['id']
    r = household.post(f'/api/v2/customer/day/{target}/quantity/', {'subscription_id': sub_id, 'quantity': 3})
    check('change one day quantity (+)', r.status_code == 200 and r.data['amount'] == 210, str(r.data and r.data.get('amount')))
    r = household.post(f'/api/v2/customer/day/{target}/skip/', {'skip': True})
    check('skip a day', r.status_code == 200 and r.data['status'] == 'skipped')
    r = household.post(f'/api/v2/customer/day/{target}/skip/', {'skip': False})
    check('undo skip', r.status_code == 200 and r.data['status'] == 'scheduled')
    past = (timezone.localdate() - timedelta(days=1)).isoformat()
    check('locked past day refused', household.post(f'/api/v2/customer/day/{past}/skip/', {'skip': True}).status_code == 400)
    shop = household.get('/api/v2/customer/shop/')
    check('shop loads with sections', shop.status_code == 200 and all(k in shop.data for k in ('recommended', 'top_buys', 'reorder', 'new_in', 'all')))
    r = household.post('/api/v2/customer/orders/', {'product_id': curd.data['id'], 'quantity': 1, 'date': target})
    check('add one-time add-on', r.status_code == 201)
    check('cancel add-on', household.post(f"/api/v2/customer/orders/{r.data['id']}/cancel/").status_code == 200)
    r = household.post('/api/v2/customer/subscriptions/', {'product_id': curd.data['id'], 'quantity': 1})
    check('subscribe to a second product', r.status_code == 201)
    check('pause it', household.patch(f"/api/v2/customer/subscriptions/{r.data['id']}/", {'status': 'paused'}).data['status'] == 'paused')
    check('cancel it', household.patch(f"/api/v2/customer/subscriptions/{r.data['id']}/", {'status': 'cancelled'}).data['status'] == 'cancelled')
    vs = date.fromisoformat(target) + timedelta(days=5)
    pv = household.get(f'/api/v2/customer/vacations/preview/?start_date={vs}&end_date={vs + timedelta(days=2)}')
    check('vacation preview shows savings', pv.status_code == 200 and pv.data['savings'] > 0)
    v = household.post('/api/v2/customer/vacations/', {'start_date': vs.isoformat(), 'end_date': (vs + timedelta(days=2)).isoformat()})
    check('create vacation', v.status_code == 201)
    check('end vacation', household.delete(f"/api/v2/customer/vacations/{v.data['id']}/").status_code == 204)
    check('doorstep preferences save', household.patch('/api/v2/customer/profile/', {'silent_delivery': True, 'use_gate_hook': True, 'photo_proof': True}).data['use_gate_hook'] is True)
    check('passport hidden for customers', household.get('/api/v2/customer/passport/').status_code == 404)
    w = household.get('/api/v2/customer/wallet/')
    check('wallet/ledger loads', w.status_code == 200 and w.data['payments_enabled'] is False)
    check('top-up refused while payments are off', household.post('/api/v2/customer/wallet/topup/', {'amount': 500, 'upi_id': 'a@ok'}).status_code == 400)
    check('withdraw refused while payments are off', household.post('/api/v2/customer/wallet/withdraw/', {'amount': 10, 'destination': 'a@ok'}).status_code == 400)
    check('bottle ledger loads', household.get('/api/v2/customer/bottles/').status_code == 200)

    section('AI (live NVIDIA models)')
    r = household.post('/api/v2/customer/assistant/', {'messages': [{'role': 'user', 'content': 'Please skip tomorrow'}]})
    check('assistant answers', r.status_code == 200 and r.data.get('reply'), f"{r.elapsed_s:.1f}s {r.data and r.data.get('engine')}")
    acts = (r.data or {}).get('actions') or []
    check('assistant proposes a skip action', any(a['type'] == 'skip_day' for a in acts), str(acts))
    if acts:
        check('confirming the proposed action works', household.post('/api/v2/customer/assistant/apply/', {'action': acts[0]}).status_code in (200, 400))
    r = household.post('/api/v2/customer/assistant/', {'messages': [{'role': 'user', 'content': 'kal doodh nahi chahiye'}]})
    check('assistant handles Hinglish', r.status_code == 200 and r.data.get('reply'))
    ins = owner.get('/api/v2/dairy/insights/')
    check('dairy insights respond fast (AI fills in the background)', ins.status_code == 200 and ins.elapsed_s < 8, f'{ins.elapsed_s:.1f}s')
    r = owner.post('/api/v2/dairy/batches/parse-report/', files={'report': ('lab.png', lab_png(), 'image/png')})
    check('lab report read by Nemotron Parse', r.status_code == 200 and r.data['fields'].get('fat_percent') == 4.1, str(r.data)[:160])
    b = owner.post('/api/v2/dairy/batches/', {'delivery_date': target, 'fat_percent': 4.1, 'snf_percent': 8.7, 'animal': 'cow'})
    check('record a lab batch', b.status_code == 201 and b.data['status'] == 'passed')

    section('Delivery partner: route, proof photo, bottles, missed/reopen')
    from apps.customers.models import CustomerProfile
    from apps.deliveries.services import generate_daily_deliveries
    from apps.subscriptions.models import Subscription
    # The plan normally starts tomorrow; start it today so this run has a real stop to deliver.
    hh_profile = CustomerProfile.objects.get(user__email=hh_email)
    Subscription.objects.filter(customer=hh_profile).update(start_date=timezone.localdate())
    generate_daily_deliveries(timezone.localdate(), dairy=hh_profile.dairy)
    route_today = partner.get('/api/v2/delivery/route/')
    check('partner route loads', route_today.status_code == 200, f'{route_today.elapsed_s:.1f}s')
    stop = next((s for s in route_today.data['stops'] if s['name'] == 'E2E Household'), None)
    check('household is on today\'s route with doorstep flags', stop and stop['doorstep']['use_gate_hook'], str(stop and stop['status']))
    check('load sheet present', route_today.data['load_sheet'])
    check('briefing responds', partner.get('/api/v2/delivery/brief/').status_code == 200)
    r = partner.post(f"/api/v2/delivery/stops/{stop['customer_id']}/complete/", data={'outcome': 'delivered'})
    check('photo required when household asked for proof', r.status_code == 400)
    r = partner.post(f"/api/v2/delivery/stops/{stop['customer_id']}/complete/", data={'outcome': 'delivered', 'bottles_returned': 0, 'pouches_returned': 3},
                     files={'photo': ('proof.jpg', jpeg_bytes('door'), 'image/jpeg')})
    check('complete drop with proof photo', r.status_code == 200 and r.data['charged'] == 140, r.text[:150])
    proof = r.data.get('photo') if r.data else None
    pr = anon.get(proof) if proof else None
    check('proof photo stored in Neon storage and served', pr is not None and pr.status_code == 200 and pr.headers['Content-Type'].startswith('image/'))
    check('double completion refused', partner.post(f"/api/v2/delivery/stops/{stop['customer_id']}/complete/", data={'outcome': 'delivered'},
                                                   files={'photo': ('p.jpg', jpeg_bytes('door'), 'image/jpeg')}).status_code == 409)
    h = household.get('/api/v2/customer/home/')
    check('customer sees today delivered + 2 bottles at home', h.data['today']['status'] == 'delivered' and h.data['bottles']['with_you'] == 2)
    notes = household.get('/api/v1/notifications/').data['results']
    check('customer got delivery notification', any(n['title'] == 'Your milk has arrived' for n in notes))
    check('partner history loads', partner.get('/api/v2/delivery/history/').status_code == 200)
    check('partner profile update', partner.patch('/api/v2/delivery/profile/', {'vehicle_number': 'MH12E2E9'}).data['vehicle_number'] == 'MH12E2E9')
    check('partner cannot see other dairy households',
          partner.post(f"/api/v2/delivery/stops/{CustomerProfile.objects.get(user__email='customer@gawali.demo').id}/complete/", data={'outcome': 'missed'}).status_code == 404)
    m = owner.get('/api/v2/dairy/manifest/')
    check('dairy dispatch shows the delivered stop', m.status_code == 200 and any(s['name'] == 'E2E Household' and s['status'] == 'delivered' for s in m.data['stops']))

    section('Refunds (live vision model) & review')
    delivered = next(i for i in h.data['today']['items'] if i.get('delivery_status') == 'delivered')
    r = household.post('/api/v2/customer/refunds/', data={'delivery_id': delivered['delivery_id'], 'issue': 'leaked'},
                       files={'photo': ('leak.jpg', jpeg_bytes('leak'), 'image/jpeg')})
    check('refund claim filed and judged within 8 s', r.status_code == 201 and r.elapsed_s < 8, f"{r.elapsed_s:.1f}s {r.data and r.data['claim']['status']}")
    claim = r.data['claim']
    check('claim photo stored and served', anon.get(claim['photo']).status_code == 200)
    if claim['status'] == 'under_review':
        d = owner.post(f"/api/v2/dairy/refunds/{claim['id']}/decision/", {'approve': True})
        check('dairy approves flagged claim', d.status_code == 200 and d.data['status'] == 'credited')
    else:
        check('claim credited instantly', claim['status'] == 'credited')
    check('second claim on same delivery refused', household.post('/api/v2/customer/refunds/', data={'delivery_id': delivered['delivery_id'], 'issue': 'leaked'},
                                                                   files={'photo': ('l.jpg', jpeg_bytes('leak'), 'image/jpeg')}).status_code == 409)

    section('Money: dues, credit limit, payments, scheduler holds')
    dues = owner.get(f'/api/v2/dairy/customers/{hh_id}/').data['dues']
    check('dues tracked automatically from deliveries', dues['due'] >= 0)
    from apps.ops import jobs
    from apps.wallet import services as ws
    ws.charge(hh_profile, Decimal_(600), 'adjustment', 'E2E test dues')
    h = household.get('/api/v2/customer/home/')
    check('customer sees over-limit banner data', h.data['dues']['over_limit'] is True, str(h.data['dues']))
    check('add-on blocked over the limit', household.post('/api/v2/customer/orders/', {'product_id': curd.data['id'], 'quantity': 1, 'date': target}).status_code == 402)
    # The assistant step skipped tomorrow; restore it so there is a delivery for the credit hold to pause.
    tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
    check('restore tomorrow (allowed even when over the limit)',
          household.post(f'/api/v2/customer/day/{tomorrow}/skip/', {'skip': False}).status_code == 200)
    held = jobs.close_tomorrow(timezone.localtime(), hh_profile.dairy)
    check('cutoff job holds the debtor\'s delivery', held.get('held') == 1, str(held))
    pay = owner.post(f'/api/v2/dairy/customers/{hh_id}/payments/', {'amount': 900, 'method': 'cash'})
    check('dairy records cash payment, hold released', pay.status_code == 201 and pay.data['holds_released'] >= 1, pay.text[:150])
    check('finance shows dues report', 'dues' in owner.get('/api/v2/dairy/finance/').data)
    check('overview KPIs load', owner.get('/api/v2/dairy/overview/').status_code == 200)

    section('Admin actions')
    r = admin.post('/api/v2/admin/broadcast/', {'audience': 'customer', 'title': f'E2E {RUN}', 'body': 'Test broadcast'})
    check('broadcast to customers', r.status_code == 201 and r.data['recipients'] > 2)
    from apps.notifications.models import Notification
    Notification.objects.filter(title=f'E2E {RUN}').delete()  # don't leave test broadcasts in real inboxes
    sc = next(u for u in admin.get(f'/api/v2/admin/users/?search={self_email}').data['results'])
    check('suspend user', admin.patch(f"/api/v2/admin/users/{sc['id']}/", {'is_active': False}).data['is_active'] is False)
    check('suspended user cannot sign in', login(self_email, PW) is None)
    check('reactivate user', admin.patch(f"/api/v2/admin/users/{sc['id']}/", {'is_active': True}).data['is_active'] is True)
    check('admin can trigger a job', admin.post('/api/v2/admin/jobs/', {'job': 'manifest_today'}).status_code == 200)
    check('audit log records admin actions', any(a['action'] in ('USER_SUSPEND', 'DAIRY_UPDATE') for a in admin.get('/api/v2/admin/audit/').data))

    section('Rate limiting')
    codes = [Client().post('/api/v1/auth/login/', {'email': f'nobody-{RUN}@x.com', 'password': 'x'}).status_code for _ in range(12)]
    check('login attempts are throttled', 429 in codes, str(codes))

    passed = sum(1 for _, ok, _ in results if ok)
    print(f'\n{passed}/{len(results)} checks passed in {time.time() - t0:.0f}s')
    return 0 if passed == len(results) else 1


def Decimal_(v):
    from decimal import Decimal
    return Decimal(v)


def cleanup(_owner_email=None):
    """Remove every E2E tenant (including ones left by an interrupted run)."""
    from apps.accounts.models import User
    from apps.dairies.models import Dairy

    for dairy in Dairy.all_objects.filter(user__email__endswith='@e2e.gawali.test'):
        _remove_tenant(dairy)
    User.objects.filter(email__endswith='@e2e.gawali.test').delete()
    print('  cleaned up E2E tenants')


def _remove_tenant(dairy):
    from apps.accounts.models import User
    from apps.customers.models import CustomerProfile
    from apps.deliveries.models import DailyDelivery
    from apps.notifications.models import Notification
    from apps.ops.models import StoredFile
    from apps.refunds.models import RefundClaim

    files = [n for n in DailyDelivery.objects.filter(subscription__customer__dairy=dairy).values_list('proof_photo', flat=True) if n]
    files += [n for n in RefundClaim.objects.filter(customer__dairy=dairy).values_list('photo', flat=True) if n]
    StoredFile.objects.filter(name__in=files).delete()
    Notification.objects.filter(body__contains=dairy.business_name).delete()
    homes = User.objects.filter(customer_profile__dairy=dairy)
    User.objects.filter(pk__in=homes).delete()
    User.objects.filter(delivery_profile__dairy=dairy).delete()
    CustomerProfile.all_objects.filter(dairy=dairy).update(dairy=None)
    User.objects.filter(pk=dairy.user_id).delete()


if __name__ == '__main__':
    try:
        code = main()
    except Exception:
        import traceback
        traceback.print_exc()
        code = 2
    finally:
        cleanup(OWNER_EMAIL)
    sys.exit(code)
