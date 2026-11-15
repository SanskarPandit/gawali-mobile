"""Customer onboarding, dairy operations, plan rules and offline delivery sync."""
import decimal
from datetime import time, timedelta
from unittest import mock

import pytest
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.billing.models import Bill
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy, DeliveryRoute
from apps.deliveries.models import DailyDelivery, DeliveryBoy
from apps.deliveries.services import generate_daily_deliveries
from apps.products.models import Product
from apps.subscriptions.models import Order, Subscription

D = decimal.Decimal


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


def make_morning(hour=9):
    """Freeze 'now' at a time before every test dairy's 22:00 cutoff."""
    real = timezone.localtime()
    return real.replace(hour=hour, minute=0, second=0, microsecond=0)


@pytest.fixture(autouse=True)
def before_cutoff():
    with mock.patch('django.utils.timezone.localtime', return_value=make_morning()):
        yield


@pytest.fixture
def other_dairy(db):
    user = User.objects.create_user(email='other@gawali.app', password='Password@123', full_name='Other Owner', role=User.Role.DAIRY)
    dairy = Dairy.objects.create(user=user, business_name='Other Dairy', phone='+919800000099', address='x', cutoff_time=time(22, 0))
    Product.objects.create(dairy=dairy, name='Other Milk', unit='L', price_per_unit=D('60'), kind=Product.Kind.SUBSCRIPTION)
    return dairy


@pytest.fixture
def gawali(db, dairy_user):
    user = User.objects.create_user(email='gawali@gawali.app', password='Password@123', full_name='Gawali One', role=User.Role.DELIVERY_BOY)
    DeliveryBoy.objects.create(user=user, dairy=dairy_user.dairy)
    return user


@pytest.fixture
def todays_delivery(customer_subscription):
    generate_daily_deliveries(timezone.localdate())
    return DailyDelivery.objects.get(subscription=customer_subscription, delivery_date=timezone.localdate())


# --- Delivery manifest & access --------------------------------------------

@pytest.mark.django_db
def test_refreshing_manifest_never_resets_marked_deliveries(dairy_client, todays_delivery):
    res = dairy_client.patch(f'/api/v1/deliveries/{todays_delivery.id}/status/', {'status': 'delivered'}, format='json')
    assert res.status_code == 200

    # Opening the list again regenerates the manifest; the delivered stop must stay delivered.
    dairy_client.get('/api/v1/deliveries/today/')
    todays_delivery.refresh_from_db()
    assert todays_delivery.status == 'delivered'
    assert todays_delivery.delivered_quantity == D('1.50')


@pytest.mark.django_db
def test_other_dairy_cannot_touch_deliveries(other_dairy, todays_delivery):
    res = client_for(other_dairy.user).patch(f'/api/v1/deliveries/{todays_delivery.id}/status/', {'status': 'delivered'}, format='json')
    assert res.status_code == status.HTTP_404_NOT_FOUND
    todays_delivery.refresh_from_db()
    assert todays_delivery.status == 'pending'


@pytest.mark.django_db
def test_gawali_of_other_dairy_cannot_touch_deliveries(other_dairy, todays_delivery):
    user = User.objects.create_user(email='g2@gawali.app', password='Password@123', full_name='G2', role=User.Role.DELIVERY_BOY)
    DeliveryBoy.objects.create(user=user, dairy=other_dairy)
    res = client_for(user).patch(f'/api/v1/deliveries/{todays_delivery.id}/status/', {'status': 'delivered'}, format='json')
    assert res.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
def test_invalid_status_rejected(dairy_client, todays_delivery):
    res = dairy_client.patch(f'/api/v1/deliveries/{todays_delivery.id}/status/', {'status': 'stolen'}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_gawali_route_lists_only_own_dairy(gawali, todays_delivery, other_dairy):
    res = client_for(gawali).get('/api/v1/deliveries/boy/route/')
    assert res.status_code == 200
    assert [s['id'] for s in res.data['stops']] == [str(todays_delivery.id)]
    assert res.data['progress'] == {'delivered': 0, 'pending': 1, 'total': 1}


@pytest.mark.django_db
def test_dairy_can_no_longer_create_gawalis(dairy_client):
    res = dairy_client.post('/api/v1/deliveries/delivery-boys/', {
        'full_name': 'X', 'phone': '+919811111111', 'email': 'x@x.com', 'password': 'Password@123',
    })
    assert res.status_code == status.HTTP_405_METHOD_NOT_ALLOWED


@pytest.mark.django_db
def test_dairy_assigns_gawali_to_own_route_only(dairy_client, dairy_user, gawali, other_dairy):
    own = DeliveryRoute.objects.create(dairy=dairy_user.dairy, name='Baner Lane')
    foreign = DeliveryRoute.objects.create(dairy=other_dairy, name='Elsewhere')
    profile = gawali.delivery_profile

    ok = dairy_client.patch(f'/api/v1/deliveries/delivery-boys/{profile.id}/', {'assigned_route': str(own.id)}, format='json')
    assert ok.status_code == 200
    assert ok.data['route_name'] == 'Baner Lane'

    bad = dairy_client.patch(f'/api/v1/deliveries/delivery-boys/{profile.id}/', {'assigned_route': str(foreign.id)}, format='json')
    assert bad.status_code == 400


# --- Offline sync -----------------------------------------------------------

@pytest.mark.django_db
def test_offline_sync_applies_and_reports_each_item(gawali, todays_delivery, other_dairy):
    foreign_sub = Subscription.objects.create(
        customer=CustomerProfile.objects.create(
            user=User.objects.create_user(email='fc@x.com', password='Password@123', full_name='FC', role=User.Role.CUSTOMER),
            dairy=other_dairy, address='y',
        ),
        product=other_dairy.products.first(), default_quantity=D('1'), start_date=timezone.localdate(),
    )
    generate_daily_deliveries(timezone.localdate())
    foreign = DailyDelivery.objects.get(subscription=foreign_sub)

    marked_at = timezone.now() - timedelta(minutes=30)
    res = client_for(gawali).post('/api/v1/deliveries/sync/', {'updates': [
        {'id': str(todays_delivery.id), 'status': 'delivered', 'delivered_quantity': '2.00', 'client_updated_at': marked_at.isoformat()},
        {'id': str(foreign.id), 'status': 'delivered', 'client_updated_at': marked_at.isoformat()},
    ]}, format='json')
    assert res.status_code == 200
    results = {r['id']: r for r in res.data['results']}
    assert results[str(todays_delivery.id)]['result'] == 'applied'
    assert results[str(foreign.id)]['result'] == 'rejected'

    todays_delivery.refresh_from_db()
    assert todays_delivery.status == 'delivered'
    assert todays_delivery.delivered_quantity == D('2.00')
    assert todays_delivery.delivered_by == gawali
    foreign.refresh_from_db()
    assert foreign.status == 'pending'


@pytest.mark.django_db
def test_offline_sync_older_change_does_not_overwrite_newer(gawali, dairy_client, todays_delivery):
    # The dairy corrects the stop to "skipped" now...
    dairy_client.patch(f'/api/v1/deliveries/{todays_delivery.id}/status/', {'status': 'skipped'}, format='json')
    # ...then an older offline "delivered" from the gawali arrives.
    old = (timezone.now() - timedelta(hours=1)).isoformat()
    res = client_for(gawali).post('/api/v1/deliveries/sync/', {'updates': [
        {'id': str(todays_delivery.id), 'status': 'delivered', 'client_updated_at': old},
    ]}, format='json')
    assert res.data['results'][0]['result'] == 'superseded'
    todays_delivery.refresh_from_db()
    assert todays_delivery.status == 'skipped'


@pytest.mark.django_db
def test_sync_rejects_deliveries_outside_window(gawali, customer_subscription):
    old_day = timezone.localdate() - timedelta(days=5)
    old = DailyDelivery.objects.create(subscription=customer_subscription, delivery_date=old_day, scheduled_quantity=D('1.5'))
    res = client_for(gawali).post('/api/v1/deliveries/sync/', {'updates': [
        {'id': str(old.id), 'status': 'delivered', 'client_updated_at': timezone.now().isoformat()},
    ]}, format='json')
    assert res.data['results'][0]['result'] == 'rejected'
    assert res.data['results'][0]['code'] == 'too_old'


# --- Customer onboarding ------------------------------------------------------

@pytest.fixture
def new_customer(db):
    return User.objects.create_user(email='new@x.com', password='Password@123', full_name='New Customer', role=User.Role.CUSTOMER)


@pytest.mark.django_db
def test_public_dairy_list_and_products(api_client, dairy_user, dairy_products):
    dairies = api_client.get('/api/v1/dairies/public-list/')
    assert dairies.status_code == 200
    assert any(d['business_name'] == 'Test Dairy Farms' for d in dairies.data['results'])
    products = api_client.get(f'/api/v1/products/dairy/{dairy_user.dairy.id}/')
    assert {p['name'] for p in products.data} == {'Cow Milk A2', 'Fresh Curd 500g'}


@pytest.mark.django_db
def test_onboarding_links_dairy_and_starts_plan(new_customer, dairy_user, dairy_products):
    milk, _ = dairy_products
    c = client_for(new_customer)
    assert c.get('/api/v1/customers/profile/').data['needs_onboarding'] is True

    res = c.post('/api/v1/customers/setup/', {
        'dairy_id': str(dairy_user.dairy.id), 'product_id': str(milk.id), 'default_quantity': '1.0',
        'address': 'Flat 9, Rose Society, Baner',
    }, format='json')
    assert res.status_code == 200, res.data
    profile = CustomerProfile.objects.get(user=new_customer)
    assert profile.dairy == dairy_user.dairy
    plan = Subscription.objects.get(customer=profile)
    assert plan.start_date == timezone.localdate() + timedelta(days=1)
    assert c.get('/api/v1/customers/profile/').data['needs_onboarding'] is False


@pytest.mark.django_db
def test_onboarding_rejects_one_time_product_and_inactive_dairy(new_customer, dairy_user, dairy_products):
    _, curd = dairy_products
    c = client_for(new_customer)
    res = c.post('/api/v1/customers/setup/', {
        'dairy_id': str(dairy_user.dairy.id), 'product_id': str(curd.id), 'default_quantity': '1', 'address': 'A',
    }, format='json')
    assert res.status_code == 400

    dairy_user.dairy.is_active = False
    dairy_user.dairy.save()
    res = c.post('/api/v1/customers/setup/', {
        'dairy_id': str(dairy_user.dairy.id), 'product_id': str(dairy_products[0].id), 'default_quantity': '1', 'address': 'A',
    }, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_customer_cannot_move_themselves_to_another_route_or_dairy(customer_client, customer_user, other_dairy):
    res = customer_client.patch('/api/v1/customers/profile/', {
        'dairy': str(other_dairy.id), 'is_active': False, 'route_stop_order': 1, 'delivery_instructions': 'Ring twice',
    }, format='json')
    assert res.status_code == 200
    profile = customer_user.customer_profile
    profile.refresh_from_db()
    assert profile.dairy != other_dairy
    assert profile.is_active is True
    assert profile.delivery_instructions == 'Ring twice'


# --- Dairy manages customers & plans ------------------------------------------

@pytest.mark.django_db
def test_dairy_adds_new_household_with_plan(dairy_client, dairy_user, dairy_products):
    route = DeliveryRoute.objects.create(dairy=dairy_user.dairy, name='Morning A')
    res = dairy_client.post('/api/v1/customers/vendor/list/', {
        'full_name': 'Asha Kale', 'email': 'asha@example.com', 'phone': '+919811000001',
        'address': 'B-12, Lake View', 'product_id': str(dairy_products[0].id), 'default_quantity': '2',
        'delivery_route': str(route.id),
    }, format='json')
    assert res.status_code == 201, res.data
    assert res.data['temporary_password']
    assert D(res.data['plan']['default_quantity']) == D('2')
    assert res.data['route_name'] == 'Morning A'
    assert User.objects.get(email='asha@example.com').role == 'customer'


@pytest.mark.django_db
def test_dairy_links_existing_unlinked_customer(dairy_client, new_customer, dairy_products):
    res = dairy_client.post('/api/v1/customers/vendor/list/', {
        'full_name': 'New Customer', 'email': 'new@x.com', 'phone': '+919811000002',
        'address': 'C-1', 'product_id': str(dairy_products[0].id), 'default_quantity': '1',
    }, format='json')
    assert res.status_code == 201, res.data
    assert res.data['linked_existing_account'] is True
    assert res.data['temporary_password'] is None


@pytest.mark.django_db
def test_dairy_cannot_take_customer_of_another_dairy(other_dairy, customer_subscription, dairy_products):
    other_milk = other_dairy.products.first()
    res = client_for(other_dairy.user).post('/api/v1/customers/vendor/list/', {
        'full_name': 'Customer Test User', 'email': 'cust_test@gawali.app', 'phone': '+919876543210',
        'address': 'X', 'product_id': str(other_milk.id), 'default_quantity': '1',
    }, format='json')
    assert res.status_code == status.HTTP_409_CONFLICT


@pytest.mark.django_db
def test_dairy_cannot_read_other_dairys_customer(other_dairy, customer_user):
    res = client_for(other_dairy.user).get(f'/api/v1/customers/vendor/{customer_user.customer_profile.id}/')
    assert res.status_code == 404


@pytest.mark.django_db
def test_dairy_list_shows_plan_and_dues(dairy_client, customer_subscription, customer_user, dairy_user):
    Bill.objects.create(customer=customer_user.customer_profile, dairy=dairy_user.dairy,
                        billing_month=timezone.localdate().replace(day=1), total_amount=D('500'), due_amount=D('500'))
    res = dairy_client.get('/api/v1/customers/vendor/list/?has_dues=true')
    row = res.data['results'][0]
    assert D(row['outstanding']) == D('500')
    assert row['plan']['product_name'] == 'Cow Milk A2'


@pytest.mark.django_db
def test_pausing_plan_clears_tomorrows_untouched_stop(dairy_client, customer_subscription, customer_user):
    tomorrow = timezone.localdate() + timedelta(days=1)
    generate_daily_deliveries(tomorrow)
    res = dairy_client.patch(f'/api/v1/subscriptions/vendor/customers/{customer_user.customer_profile.id}/plan/',
                             {'status': 'paused'}, format='json')
    assert res.status_code == 200
    row = DailyDelivery.objects.get(subscription=customer_subscription, delivery_date=tomorrow)
    assert row.status == 'skipped'

    dairy_client.patch(f'/api/v1/subscriptions/vendor/customers/{customer_user.customer_profile.id}/plan/',
                       {'status': 'active'}, format='json')
    row.refresh_from_db()
    assert row.status == 'pending'


@pytest.mark.django_db
def test_plan_change_never_alters_today(customer_client, todays_delivery):
    res = customer_client.patch('/api/v1/subscriptions/plan/', {'default_quantity': '3'}, format='json')
    assert res.status_code == 200
    generate_daily_deliveries(timezone.localdate())
    todays_delivery.refresh_from_db()
    assert todays_delivery.scheduled_quantity == D('1.50')


@pytest.mark.django_db
def test_customer_cannot_cancel_or_switch_to_foreign_product(customer_client, customer_subscription, other_dairy):
    assert customer_client.patch('/api/v1/subscriptions/plan/', {'status': 'cancelled'}, format='json').status_code == 400
    foreign = other_dairy.products.first()
    assert customer_client.patch('/api/v1/subscriptions/plan/', {'product_id': str(foreign.id)}, format='json').status_code == 400


@pytest.mark.django_db
def test_route_reorder(dairy_client, dairy_user, customer_user):
    route = DeliveryRoute.objects.create(dairy=dairy_user.dairy, name='R1')
    second = CustomerProfile.objects.create(
        user=User.objects.create_user(email='c2@x.com', password='Password@123', full_name='C2', role=User.Role.CUSTOMER),
        dairy=dairy_user.dairy, address='z', delivery_route=route,
    )
    first = customer_user.customer_profile
    first.delivery_route = route
    first.save()
    res = dairy_client.post('/api/v1/customers/vendor/reorder/', {
        'route_id': str(route.id), 'customer_ids': [str(second.id), str(first.id)],
    }, format='json')
    assert res.status_code == 200
    second.refresh_from_db()
    first.refresh_from_db()
    assert (second.route_stop_order, first.route_stop_order) == (1, 2)


@pytest.mark.django_db
def test_deleting_route_unassigns_customers(dairy_client, dairy_user, customer_user):
    route = DeliveryRoute.objects.create(dairy=dairy_user.dairy, name='Temp')
    profile = customer_user.customer_profile
    profile.delivery_route = route
    profile.save()
    assert dairy_client.delete(f'/api/v1/dairies/routes/{route.id}/').status_code == 204
    profile.refresh_from_db()
    assert profile.delivery_route is None


# --- Cutoffs, overrides, orders ---------------------------------------------------

@pytest.mark.django_db
def test_tomorrow_locked_after_cutoff(customer_client, customer_subscription):
    late = make_morning(hour=23)
    with mock.patch('django.utils.timezone.localtime', return_value=late):
        tomorrow = (timezone.localdate() + timedelta(days=1)).isoformat()
        res = customer_client.post('/api/v1/subscriptions/override/', {'date': tomorrow, 'quantity': '0'}, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_skip_tomorrow_updates_manifest(customer_client, customer_subscription):
    tomorrow = timezone.localdate() + timedelta(days=1)
    generate_daily_deliveries(tomorrow)
    res = customer_client.post('/api/v1/subscriptions/override/', {'date': tomorrow.isoformat(), 'quantity': '0'}, format='json')
    assert res.status_code == 200
    assert DailyDelivery.objects.get(subscription=customer_subscription, delivery_date=tomorrow).status == 'skipped'

    # Undo by setting the normal quantity again.
    customer_client.post('/api/v1/subscriptions/override/', {'date': tomorrow.isoformat(), 'quantity': '1.5'}, format='json')
    assert DailyDelivery.objects.get(subscription=customer_subscription, delivery_date=tomorrow).status == 'pending'


@pytest.mark.django_db
def test_negative_override_rejected(customer_client, customer_subscription):
    day = (timezone.localdate() + timedelta(days=2)).isoformat()
    assert customer_client.post('/api/v1/subscriptions/override/', {'date': day, 'quantity': '-1'}, format='json').status_code == 400


@pytest.mark.django_db
def test_order_rules(customer_client, customer_subscription, dairy_products, other_dairy, dairy_client):
    _, curd = dairy_products
    day = (timezone.localdate() + timedelta(days=2)).isoformat()

    res = customer_client.post('/api/v1/subscriptions/orders/', {
        'product': str(curd.id), 'quantity': '2', 'delivery_date': day, 'status': 'delivered',
    }, format='json')
    assert res.status_code == 201, res.data
    assert res.data['status'] == 'pending'  # status is never client-controlled
    assert D(res.data['total_price']) == D('90.00')
    order_id = res.data['id']

    other_curd = Product.objects.create(dairy=other_dairy, name='Other Curd', unit='pack', price_per_unit=D('10'), kind='one_time')
    bad = customer_client.post('/api/v1/subscriptions/orders/', {
        'product': str(other_curd.id), 'quantity': '1', 'delivery_date': day,
    }, format='json')
    assert bad.status_code == 400

    past = customer_client.post('/api/v1/subscriptions/orders/', {
        'product': str(curd.id), 'quantity': '1', 'delivery_date': timezone.localdate().isoformat(),
    }, format='json')
    assert past.status_code == 400

    assert customer_client.post(f'/api/v1/subscriptions/orders/{order_id}/cancel/').data['status'] == 'cancelled'
    assert dairy_client.get('/api/v1/subscriptions/orders/').data['count'] == 1


# --- Billing fixes ------------------------------------------------------------------

@pytest.mark.django_db
def test_gawali_cannot_download_bill(gawali, customer_user, dairy_user):
    bill = Bill.objects.create(customer=customer_user.customer_profile, dairy=dairy_user.dairy,
                               billing_month=timezone.localdate().replace(day=1))
    assert client_for(gawali).get(f'/api/v1/billing/{bill.id}/pdf/').status_code == 404


@pytest.mark.django_db
def test_partial_cash_payment(dairy_client, customer_user, dairy_user):
    bill = Bill.objects.create(customer=customer_user.customer_profile, dairy=dairy_user.dairy,
                               billing_month=timezone.localdate().replace(day=1), total_amount=D('500'), due_amount=D('500'))
    res = dairy_client.post(f'/api/v1/billing/vendor/mark-paid/{bill.id}/', {'amount': '200.50'}, format='json')
    assert res.status_code == 200, res.data
    bill.refresh_from_db()
    assert bill.paid_amount == D('200.50')
    assert bill.due_amount == D('299.50')
    assert bill.status == 'partially_paid'
