import pytest
from rest_framework.test import APIClient
from django.utils import timezone
from datetime import time, timedelta
import decimal

from apps.accounts.models import User
from apps.dairies.models import Dairy, DeliveryRoute
from apps.customers.models import CustomerProfile
from apps.products.models import Product
from apps.subscriptions.models import Subscription

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def admin_user(db):
    user = User.objects.create_user(
        email='admin_test@gawali.app',
        password='Password@123',
        full_name='Test Admin',
        role=User.Role.ADMIN,
        is_staff=True,
        is_superuser=True
    )
    return user

@pytest.fixture
def admin_client(admin_user):
    client = APIClient()
    client.force_authenticate(user=admin_user)
    return client

@pytest.fixture
def dairy_user(db):
    user = User.objects.create_user(
        email='dairy_test@gawali.app',
        password='Password@123',
        full_name='Dairy Owner Test',
        role=User.Role.DAIRY
    )
    dairy = Dairy.objects.create(
        user=user,
        business_name='Test Dairy Farms',
        phone='+919800112233',
        address='123 Dairy Lane, Pune',
        city='Pune',
        cutoff_time=time(22, 0, 0),
        bank_upi_id='testdairy@upi'
    )
    return user

@pytest.fixture
def dairy_client(dairy_user):
    client = APIClient()
    client.force_authenticate(user=dairy_user)
    return client

@pytest.fixture
def customer_user(db, dairy_user):
    user = User.objects.create_user(
        email='cust_test@gawali.app',
        password='Password@123',
        full_name='Customer Test User',
        phone='+919876543210',
        role=User.Role.CUSTOMER
    )
    profile = CustomerProfile.objects.create(
        user=user,
        dairy=dairy_user.dairy,
        address='Flat 101, A-Wing, Pune',
        delivery_instructions='Leave at door hook',
        latitude=decimal.Decimal('18.5204'),
        longitude=decimal.Decimal('73.8567')
    )
    return user

@pytest.fixture
def customer_client(customer_user):
    client = APIClient()
    client.force_authenticate(user=customer_user)
    return client

@pytest.fixture
def dairy_products(db, dairy_user):
    p1 = Product.objects.create(
        dairy=dairy_user.dairy,
        name='Cow Milk A2',
        unit='L',
        price_per_unit=decimal.Decimal('70.00'),
        kind=Product.Kind.SUBSCRIPTION
    )
    p2 = Product.objects.create(
        dairy=dairy_user.dairy,
        name='Fresh Curd 500g',
        unit='500g',
        price_per_unit=decimal.Decimal('45.00'),
        kind=Product.Kind.ONE_TIME
    )
    return p1, p2

@pytest.fixture
def customer_subscription(db, customer_user, dairy_products):
    p1, _ = dairy_products
    sub = Subscription.objects.create(
        customer=customer_user.customer_profile,
        product=p1,
        default_quantity=decimal.Decimal('1.50'),
        delivery_time_slot=Subscription.TimeSlot.MORNING,
        status=Subscription.Status.ACTIVE,
        start_date=timezone.localdate() - timedelta(days=30)
    )
    return sub
