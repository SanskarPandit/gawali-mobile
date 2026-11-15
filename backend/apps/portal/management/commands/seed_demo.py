"""
Demo data for Gawali: three roles, two dairies, a realistic month of history.

    python manage.py seed_demo

Re-running wipes and recreates only the *@gawali.demo accounts and their dairies.
Every demo password is Gawali@2026.
"""
import math
import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import OperationalError, connection, transaction
from django.db.models import Q
from django.utils import timezone

from apps.accounts.models import User
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy, DeliveryRoute
from apps.deliveries.models import DailyDelivery, DeliveryBoy
from apps.deliveries.services import generate_daily_deliveries
from apps.notifications.models import Notification
from apps.portal.services import assign_batch
from apps.portal.views_dairy import simulated_cold_chain
from apps.products.models import Product
from apps.quality.models import MilkBatch
from apps.refunds.models import RefundClaim
from apps.subscriptions.models import DeliveryOverride, Order, Subscription, VacationPeriod
from apps.wallet import services as ws
from apps.wallet.models import PackagingEntry, Wallet, WalletTransaction

PASSWORD = 'Gawali@2026'
DOMAIN = '@gawali.demo'

CATALOG = [
    # name, unit, price, category, container, animal, kind, step, fat, new, featured, description
    ('A2 Gir Cow Milk', '1 L', 92, 'milk', 'glass_bottle', 'a2_cow', 'subscription', 1, 4.2, False, True,
     'Single-origin A2 milk from free-grazing Gir cows. Bottled within the hour, never homogenised.'),
    ('A2 Gir Cow Milk · Half', '500 ml', 48, 'milk', 'glass_bottle', 'a2_cow', 'subscription', 1, 4.2, False, False,
     'The same A2 Gir milk in a 500 ml returnable bottle.'),
    ('Farm Cow Milk', '500 ml', 34, 'milk', 'pouch', 'cow', 'subscription', 1, 3.8, False, False,
     'Everyday cow milk from our partner farms, pasteurised and chilled to 4 °C.'),
    ('Buffalo Milk', '1 L', 86, 'milk', 'glass_bottle', 'buffalo', 'subscription', 1, 6.5, False, True,
     'Rich, creamy Murrah buffalo milk — ideal for chai, malai and homemade paneer.'),
    ('Toned Milk', '500 ml', 29, 'milk', 'pouch', 'cow', 'subscription', 1, 3.0, False, False,
     'Lighter toned milk with 3% fat for everyday cooking.'),
    ('Set Curd', '400 g', 45, 'curd', 'tub', 'none', 'one_time', 1, None, False, False,
     'Thick, slow-set dahi made every evening from that morning\'s milk.'),
    ('Greek Yogurt · Wild Honey', '100 g', 55, 'curd', 'tub', 'none', 'one_time', 1, None, True, False,
     'Strained high-protein yogurt with a ribbon of wild forest honey.'),
    ('Malai Paneer', '200 g', 98, 'paneer', 'pack', 'none', 'one_time', 1, None, False, True,
     'Soft, fresh paneer pressed this morning. No starch, no preservatives.'),
    ('Bilona A2 Ghee', '250 ml', 790, 'ghee', 'glass_bottle', 'none', 'one_time', 1, None, False, True,
     'Hand-churned bilona ghee from cultured A2 curd. Granular, nutty, aromatic.'),
    ('White Butter', '100 g', 72, 'ghee', 'tub', 'none', 'one_time', 1, None, True, False,
     'Unsalted makkhan churned from fresh cream.'),
    ('Sourdough Loaf', '400 g', 140, 'bakery', 'pack', 'none', 'one_time', 1, None, True, False,
     '36-hour fermented sourdough from a Baner micro-bakery, baked at 3 AM.'),
    ('Whole Wheat Bread', '400 g', 55, 'bakery', 'pack', 'none', 'one_time', 1, None, False, False,
     '100% whole wheat sandwich loaf, baked fresh daily.'),
    ('Free-range Eggs', '6 pcs', 84, 'eggs', 'pack', 'none', 'one_time', 1, None, False, False,
     'Brown eggs from pasture-raised hens in Mulshi.'),
    ('Masala Chaas', '200 ml', 25, 'other', 'pouch', 'none', 'one_time', 1, None, True, False,
     'Spiced buttermilk with roasted jeera and coriander.'),
]

HOUSEHOLDS = [
    # name, email-slug, phone, route idx, flat, society, plan [(product, qty)], billing, silent, hook, gate
    ('Ananya Kulkarni', 'customer', '+919800000001', 0, 'B-702', 'Kumar Primrose, Baner', [('A2 Gir Cow Milk', 2)], 'wallet', True, True, True),
    ('Rohan Deshpande', 'rohan', '+919800000002', 0, 'A-1103', 'Kumar Primrose, Baner', [('Farm Cow Milk', 2), ('Set Curd', 1)], 'autopay', True, False, True),
    ('Meera Iyer', 'meera', '+919800000003', 0, 'Villa 12', 'Balewadi Greens', [('Buffalo Milk', 1)], 'wallet', False, True, False),
    ('Kabir Shah', 'kabir', '+919800000004', 0, 'C-404', 'Pristine Prolife, Balewadi', [('A2 Gir Cow Milk · Half', 2)], 'wallet', True, False, True),
    ('Sneha Joshi', 'sneha', '+919800000005', 0, 'D-201', 'Rohan Leher, Baner', [('Farm Cow Milk', 1)], 'wallet', False, False, False),
    ('Aditya Rao', 'aditya', '+919800000006', 0, 'E-905', 'Kohinoor Coral, Baner', [('A2 Gir Cow Milk', 1), ('Set Curd', 1)], 'autopay', True, True, True),
    ('Priya Nair', 'priya', '+919800000007', 0, 'F-302', 'Mont Vert Belvedere, Baner', [('Toned Milk', 2)], 'wallet', True, False, True),
    ('Vikram Patil', 'vikram', '+919800000008', 0, 'Row House 4', 'Sus Road', [('Buffalo Milk', 2)], 'wallet', False, True, False),
    ('Isha Mehta', 'isha', '+919800000009', 1, 'A-601', 'Pride Purple Park, Aundh', [('A2 Gir Cow Milk', 1)], 'wallet', True, False, True),
    ('Nikhil Bhosale', 'nikhil', '+919800000010', 1, 'Bungalow 7', 'Pashan-Sus Road', [('Farm Cow Milk', 2)], 'autopay', False, True, False),
    ('Tanvi Gokhale', 'tanvi', '+919800000011', 1, 'B-1502', 'Konark Orchid, Aundh', [('Buffalo Milk', 1), ('Set Curd', 1)], 'wallet', True, False, True),
    ('Arjun Menon', 'arjun', '+919800000012', 1, 'C-203', 'Sindh Society, Aundh', [('A2 Gir Cow Milk · Half', 1)], 'wallet', True, True, False),
    ('Kavya Reddy', 'kavya', '+919800000013', 1, 'D-808', 'Gagan Utopia, Pashan', [('Toned Milk', 1)], 'wallet', False, False, True),
    ('Siddharth Kale', 'siddharth', '+919800000014', 1, 'Flat 3', 'NCL Colony, Pashan', [('Farm Cow Milk', 1)], 'wallet', False, False, False),
]

LEAK_SVG = b'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><rect width="600" height="450" fill="#d8d2c8"/>
<rect x="0" y="300" width="600" height="150" fill="#bdb4a6"/><path d="M180 120 q120-40 240 0 l-20 200 q-100 30-200 0z" fill="#f4f4f2" stroke="#c9c6bf" stroke-width="3"/>
<path d="M300 300 q-60 60 -140 70 q90 20 230 -5 q-40 -20 -90 -65z" fill="#fafaf8" opacity=".95"/><path d="M296 250 l12 30 -10 22" stroke="#9a948a" stroke-width="3" fill="none"/></svg>'''

DOOR_SVG = b'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450"><defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1">
<stop offset="0" stop-color="#3a3430"/><stop offset="1" stop-color="#211d1a"/></linearGradient></defs><rect width="600" height="450" fill="url(#g)"/>
<rect x="150" y="30" width="300" height="420" rx="6" fill="#7a5a40"/><rect x="170" y="50" width="260" height="170" rx="4" fill="#6b4e37"/>
<rect x="170" y="240" width="260" height="190" rx="4" fill="#6b4e37"/><circle cx="415" cy="235" r="9" fill="#d8c27a"/>
<rect x="232" y="150" width="8" height="40" fill="#b7b0a4"/><path d="M200 190 h80 l-8 120 h-64z" fill="#efe9dc" stroke="#cfc6b4" stroke-width="3"/>
<rect x="214" y="205" width="22" height="70" rx="6" fill="#ffffff" opacity=".9"/><rect x="242" y="205" width="22" height="70" rx="6" fill="#ffffff" opacity=".9"/>
<text x="20" y="430" font-family="monospace" font-size="16" fill="#ffffff" opacity=".7">GAWALI - PROOF OF DROP</text></svg>'''


def at(day, hh, mm, ss=0):
    return timezone.make_aware(datetime.combine(day, time(hh, mm, ss)), timezone.get_current_timezone())


class Command(BaseCommand):
    help = 'Seed Gawali demo accounts (customer, gawali, delivery partner) and a month of history.'

    def handle(self, *args, **options):
        self.rng = random.Random(2026)
        # Short transactions only: a remote pooler (e.g. Supabase) drops connections held open for minutes.
        with transaction.atomic():
            self.wipe()
        self.build()
        self.stdout.write(self.style.SUCCESS('\nGawali demo ready. Password for every account: ' + PASSWORD))
        for role, email in (('Customer', 'customer'), ('Gawali (dairy)', 'gawali'), ('Delivery partner', 'delivery'), ('Platform admin', 'admin')):
            self.stdout.write(f'  {role:<18} {email}{DOMAIN}')

    def wipe(self):
        # '@corven.demo' was the demo domain before the product was named Gawali.
        demo = User.objects.filter(Q(email__endswith=DOMAIN) | Q(email__endswith='@corven.demo'))
        # Uploaded photos live outside these rows (object storage), so remove them explicitly.
        from django.core.files.storage import default_storage
        names = [n for n in DailyDelivery.objects.filter(subscription__customer__user__in=demo)
                 .exclude(proof_photo='').values_list('proof_photo', flat=True) if n]
        names += [n for n in RefundClaim.objects.filter(customer__user__in=demo).values_list('photo', flat=True) if n]
        for name in set(names):
            try:
                default_storage.delete(name)
            except Exception:
                pass
        # Customers first: their plans protect products, and dairies protect their customers.
        User.objects.filter(pk__in=demo.filter(role='customer')).delete()
        User.objects.filter(pk__in=demo.filter(role='delivery_boy')).delete()
        for d in Dairy.all_objects.filter(user__in=demo):
            CustomerProfile.all_objects.filter(dairy=d).update(dairy=None, delivery_route=None)
        User.objects.filter(pk__in=demo).delete()

    def user(self, slug, name, phone, role):
        u = User.objects.create_user(email=f'{slug}{DOMAIN}', password=PASSWORD, full_name=name, phone=phone, role=role,
                                     is_email_verified=True, is_phone_verified=True)
        User.objects.filter(pk=u.pk).update(created_at=timezone.now() - timedelta(days=60))
        return u

    def build(self):
        today = timezone.localdate()
        start = today - timedelta(days=30)

        admin = self.user('admin', 'Platform Admin', '+919811100000', User.Role.ADMIN)
        User.objects.filter(pk=admin.pk).update(is_staff=True)
        owner = self.user('gawali', 'Dnyaneshwar Shinde', '+919811100001', User.Role.DAIRY)
        dairy = Dairy.objects.create(
            user=owner, business_name='Sangamner Valley Dairy', phone='+919811100001',
            address='Survey 41, Baner–Pashan Link Road', city='Pune', pincode='411045',
            hub_name='Sangamner Dairy Hub #4', cutoff_time=time(23, 0), slot_start=time(5, 30), slot_end=time(6, 15),
            bank_upi_id='sangamnervalley@okaxis', bottle_deposit=Decimal('10'), pouch_eco_credit=Decimal('5'),
        )
        other = self.user('mulshi', 'Gauri Pawar', '+919811100002', User.Role.DAIRY)
        other_dairy = Dairy.objects.create(user=other, business_name='Mulshi Organic Farms', phone='+919811100002',
                                           address='Paud Road, Mulshi', city='Pune', pincode='412108',
                                           hub_name='Mulshi Hill Hub', cutoff_time=time(22, 0))
        for name, unit, price, cat, cont, animal, kind, *_ in CATALOG[:3] + CATALOG[5:6]:
            Product.objects.create(dairy=other_dairy, name=name, unit=unit, price_per_unit=Decimal(price) + 4,
                                   category=cat, container=cont, animal=animal, kind=kind)

        products = {}
        for i, (name, unit, price, cat, cont, animal, kind, step, fat, new, featured, desc) in enumerate(CATALOG):
            p = Product.objects.create(dairy=dairy, name=name, unit=unit, price_per_unit=Decimal(price), category=cat,
                                       container=cont, animal=animal, kind=kind, quantity_step=Decimal(step),
                                       fat_percent=Decimal(str(fat)) if fat else None, is_new=new, is_featured=featured,
                                       description=desc)
            if not new:
                Product.objects.filter(pk=p.pk).update(created_at=timezone.now() - timedelta(days=90 - i))
            products[name] = p

        routes = [
            DeliveryRoute.objects.create(dairy=dairy, name='Baner – Balewadi', sort_order=1,
                                         description='Kumar Primrose to Sus Road, clockwise'),
            DeliveryRoute.objects.create(dairy=dairy, name='Aundh – Pashan', sort_order=2,
                                         description='Aundh ITI Road loop, then Pashan'),
        ]
        partners = [
            DeliveryBoy.objects.create(user=self.user('delivery', 'Ravi Jadhav', '+919822200001', User.Role.DELIVERY_BOY),
                                       dairy=dairy, assigned_route=routes[0], vehicle_number='MH 12 RJ 4471'),
            DeliveryBoy.objects.create(user=self.user('delivery2', 'Sagar More', '+919822200002', User.Role.DELIVERY_BOY),
                                       dairy=dairy, assigned_route=routes[1], vehicle_number='MH 14 SM 2290'),
        ]

        customers = []
        stop = [0, 0]
        for name, slug, phone, ri, flat, society, plan, billing, silent, hook, gate in HOUSEHOLDS:
            stop[ri] += 1
            u = self.user(slug, name, phone, User.Role.CUSTOMER)
            c = CustomerProfile.objects.create(
                user=u, dairy=dairy, delivery_route=routes[ri], route_stop_order=stop[ri], address=f'{society}, Pune',
                flat_or_house_number=flat, society_name=society.split(',')[0], landmark='Near main gate',
                silent_delivery=silent, use_gate_hook=hook, photo_proof=True, society_gate_pass=gate,
                delivery_instructions='Milk bag on the brass hook, please.' if hook else '',
                latitude=Decimal('18.55') + Decimal(self.rng.randint(0, 300)) / 10000,
                longitude=Decimal('73.78') + Decimal(self.rng.randint(0, 300)) / 10000,
            )
            CustomerProfile.objects.filter(pk=c.pk).update(created_at=timezone.now() - timedelta(days=45))
            w = ws.get_wallet(c)
            if billing == 'autopay' and settings.PAYMENTS_ENABLED:
                w.billing_mode, w.autopay_status, w.autopay_upi_id = 'autopay', 'active', f'{slug}@okhdfcbank'
            w.default_withdraw_upi = f'{slug}@okhdfcbank'
            w.auto_topup_enabled = slug in ('kabir', 'tanvi')
            w.save()
            for pname, qty in plan:
                Subscription.objects.create(customer=c, product=products[pname], default_quantity=Decimal(qty),
                                            start_date=start - timedelta(days=15))
            customers.append(c)

        demo = customers[0]
        # Variety in the past month: skips, a vacation, extra orders.
        for c in customers[1:]:
            for _ in range(self.rng.randint(0, 3)):
                d = start + timedelta(days=self.rng.randint(0, 28))
                for s in c.subscriptions.all():
                    DeliveryOverride.objects.get_or_create(subscription=s, date=d, defaults={'quantity': 0, 'override_type': 'skip'})
        VacationPeriod.objects.create(customer=customers[4], start_date=today - timedelta(days=2),
                                      end_date=today + timedelta(days=3), reason='Family wedding in Nashik')
        VacationPeriod.objects.create(customer=customers[11], start_date=today - timedelta(days=18),
                                      end_date=today - timedelta(days=14), reason='Goa trip')

        extras = ['Whole Wheat Bread', 'Malai Paneer', 'Free-range Eggs', 'Set Curd', 'Sourdough Loaf', 'Masala Chaas']
        for c in customers:
            weight = 9 if c is demo else self.rng.randint(1, 5)
            for _ in range(weight):
                pname = self.rng.choice(extras[:4] if c is not demo else ['Whole Wheat Bread', 'Malai Paneer', 'Set Curd', 'Free-range Eggs'])
                d = start + timedelta(days=self.rng.randint(0, 29))
                p = products[pname]
                Order.objects.create(customer=c, dairy=dairy, product=p, quantity=1, unit_price=p.price_per_unit,
                                     total_price=p.price_per_unit, delivery_date=d, source='shop')

        # Batches: one per animal per morning, each with its cold-chain log.
        for i in range(-30, 2):
            day = today + timedelta(days=i)
            for animal, fat, snf, hour in (('a2_cow', '4.2', '8.8', 16), ('cow', '3.9', '8.6', 16), ('buffalo', '6.6', '9.1', 17)):
                milked = at(day - timedelta(days=1), hour, 15)
                MilkBatch.objects.create(
                    dairy=dairy, code=f"SGN4-{day:%m%d}-{animal[:2].upper()}", animal=animal, delivery_date=day,
                    hub_name=dairy.hub_name, milked_at=milked, chilled_at=milked + timedelta(minutes=38 + self.rng.randint(0, 7)),
                    temperature_log=simulated_cold_chain(milked, 40, 3.8, day),
                    fat_percent=Decimal(fat) + Decimal(self.rng.randint(-1, 1)) / 10, snf_percent=Decimal(snf),
                    certified_by='Dr. Pallavi Sathe, Q.A. Lead', lab_name='Sangamner Hub FSSAI-accredited lab',
                )

        # A month of deliveries, settled the way the partner app settles them.
        for i in range(31):
            for attempt in (1, 2):
                try:
                    with transaction.atomic():
                        self.seed_day(i, start + timedelta(days=i), today, customers, demo, routes, partners, dairy)
                    break
                except OperationalError:
                    # A dropped connection rolls the day back; reconnect and redo it once.
                    if attempt == 2:
                        raise
                    connection.close()
                    self.stdout.write(f'  connection dropped on day {i + 1}; retrying')
        self.finish(today, dairy, products, customers, demo, owner, partners)

    def seed_day(self, i, day, today, customers, demo, routes, partners, dairy):
        """One day of history, committed on its own."""
        self.ledger_topups(customers, day - timedelta(days=1))
        generate_daily_deliveries(day, dairy=dairy)
        is_today = day == today
        for c in customers:
            rows = list(DailyDelivery.objects.filter(subscription__customer=c, delivery_date=day)
                        .select_related('subscription__product'))
            if not rows:
                continue
            partner = partners[0] if c.delivery_route_id == routes[0].id else partners[1]
            pending_today = is_today and (c is not demo and c.route_stop_order > 3)
            if pending_today:
                continue
            self.settle(c, day, rows, partner.user, photo=is_today or i % 6 == 0)

    def finish(self, today, dairy, products, customers, demo, owner, partners):
        for b in MilkBatch.objects.filter(dairy=dairy):
            assign_batch(b)
        generate_daily_deliveries(today + timedelta(days=1), dairy=dairy)

        # Demo customer: an upcoming add-on, refunds, notifications and a tidy wallet.
        sourdough = products['Sourdough Loaf']
        Order.objects.create(customer=demo, dairy=dairy, product=sourdough, quantity=1, unit_price=sourdough.price_per_unit,
                             total_price=sourdough.price_per_unit, delivery_date=today + timedelta(days=2), source='shop')

        past = DailyDelivery.objects.filter(subscription__customer=demo, status='delivered',
                                            delivery_date=today - timedelta(days=6)).first()
        if past:
            claim = RefundClaim(customer=demo, delivery=past, issue='leaked', amount=past.subscription.product.price_per_unit,
                                status='credited', ai_verdict='verified', ai_confidence=Decimal('0.93'),
                                ai_observation='Torn seam visible on the bottle cap with milk pooled underneath.',
                                ai_engine='nvidia/llama-3.1-nemotron-nano-vl-8b-v1', processing_ms=2380,
                                credited_at=at(past.delivery_date, 6, 41))
            claim.photo.save('seed-leak.svg', ContentFile(LEAK_SVG), save=False)
            claim.save()
            t = ws.credit(demo, claim.amount, 'refund', 'Instant refund · A2 Gir Cow Milk (Leaked / Broken Seal)',
                          reference=str(past.id), for_date=past.delivery_date)
            self.backdate(t, claim.credited_at)
        flagged = DailyDelivery.objects.filter(subscription__customer=customers[2], status='delivered').order_by('-delivery_date').first()
        if flagged:
            c2 = RefundClaim(customer=customers[2], delivery=flagged, issue='curdled', amount=flagged.subscription.product.price_per_unit,
                             status='under_review', ai_verdict='unclear', ai_confidence=Decimal('0.38'),
                             ai_observation='Vessel visible but the milk texture is hard to judge in this light.',
                             ai_engine='nvidia/llama-3.1-nemotron-nano-vl-8b-v1', processing_ms=3110)
            c2.photo.save('seed-curdled.svg', ContentFile(LEAK_SVG), save=False)
            c2.save()

        w = ws.get_wallet(demo)
        if w.balance < Decimal('720'):
            amount = Decimal(math.ceil((Decimal('720') - w.balance) / 100) * 100)
            t = self.pay(demo, max(amount, Decimal('100')), 'ananya@okhdfcbank')
            self.backdate(t, at(today - timedelta(days=1), 21, 12))

        for title, body, kind, hours in (
            ('Your milk has arrived', 'Dropped at 6:02 AM by Ravi Jadhav. Placed in the milk bag on your gate hook.', 'delivery_done', 3),
            ('Refund credited in 2.4 s', '₹92 for a leaked bottle was added to your wallet. Sorry about that.', 'complaint_update', 6 * 24),
            ('Cutoff reminder', 'Changes for tomorrow close at 11:00 PM tonight.', 'cutoff_reminder', 20),
            ('New in: Sourdough Loaf', 'Baked at 3 AM in Baner, delivered with your milk. Add it from the shop.', 'general', 30),
        ):
            n = Notification.objects.create(user=demo.user, title=title, body=body, notification_type=kind,
                                            is_read=hours > 12)
            Notification.objects.filter(pk=n.pk).update(created_at=timezone.now() - timedelta(hours=hours))
        Notification.objects.create(user=owner, title='Refund claim needs review',
                                    body='Meera Iyer: Curdled Upon Boiling · ₹86', data={})
        Notification.objects.create(user=partners[0].user, title='Express order on your route',
                                    body='Deliver express orders first — they carry a 15-minute promise.', data={})

        self.stdout.write(f'  {len(customers)} households, {Product.objects.filter(dairy=dairy).count()} products, '
                          f'{DailyDelivery.objects.filter(subscription__customer__dairy=dairy).count()} delivery rows, '
                          f'{WalletTransaction.objects.filter(wallet__customer__dairy=dairy).count()} wallet transactions')

    def settle(self, c, day, rows, partner_user, photo=False):
        when = at(day, 5, 35 + c.route_stop_order * 3, self.rng.randint(0, 59))
        if all(r.status == 'skipped' for r in rows):
            Order.objects.filter(customer=c, delivery_date=day, status='pending').update(status='cancelled')
            return
        bottles_issued = 0
        saved_photo = None
        for r in rows:
            if r.status != 'pending' or r.scheduled_quantity <= 0:
                continue
            r.status, r.delivered_quantity, r.delivered_at = 'delivered', r.scheduled_quantity, when
            r.delivered_by, r.status_updated_at, r.is_settled = partner_user, when, True
            if photo:
                if saved_photo is None:
                    r.proof_photo.save(f'seed-{c.id}-{day:%Y%m%d}.svg', ContentFile(DOOR_SVG), save=False)
                    saved_photo = r.proof_photo.name
                else:
                    r.proof_photo.name = saved_photo
            r.save()
            p = r.subscription.product
            t = ws.charge(c, r.delivered_quantity * p.price_per_unit, 'delivery', f'{p.name} · {r.delivered_quantity:g} {p.unit}',
                          reference=str(r.id), for_date=day)
            self.backdate(t, when)
            if p.container == 'glass_bottle':
                bottles_issued += math.ceil(r.delivered_quantity)
        for o in Order.objects.filter(customer=c, delivery_date=day, status='pending').select_related('product'):
            o.status, o.delivered_at, o.is_settled = 'delivered', when, True
            o.save()
            t = ws.charge(c, o.total_price, 'order', f'{o.product.name} · {o.quantity:g} {o.product.unit}',
                          reference=str(o.id), for_date=day)
            self.backdate(t, when)
        if bottles_issued or self.rng.random() < 0.15:
            returned = ws.bottles_with_customer(c)
            if c.user.email.startswith('customer@') and day == timezone.localdate():
                returned = max(0, returned - 1)  # the demo household keeps one empty at home
            ws.record_packaging(c, on_date=day, bottles_issued=bottles_issued, bottles_returned=returned,
                                pouches=self.rng.choice([0, 0, 0, 4, 6]), user=partner_user)
            PackagingEntry.objects.filter(customer=c, date=day).update(created_at=when)
            WalletTransaction.objects.filter(wallet__customer=c, for_date=day, created_at__gt=when).update(created_at=when)

    def ledger_topups(self, customers, day):
        for c in customers:
            w = Wallet.objects.get(customer=c)
            if w.billing_mode == 'wallet' and not w.auto_topup_enabled and w.balance < Decimal('250'):
                t = self.pay(c, Decimal(self.rng.choice([1000, 1500, 2000])), w.default_withdraw_upi or 'upi@okaxis')
                self.backdate(t, at(day, 20, self.rng.randint(0, 59)))

    @staticmethod
    def pay(customer, amount, upi):
        """UPI top-up when payments are on; otherwise the dairy collecting cash/UPI directly."""
        if settings.PAYMENTS_ENABLED:
            return ws.topup(customer, amount, upi)
        return ws.record_offline_payment(customer, amount, 'upi to dairy', customer.dairy.user)

    @staticmethod
    def backdate(t, when):
        if t is not None:
            WalletTransaction.objects.filter(pk=t.pk).update(created_at=when)
