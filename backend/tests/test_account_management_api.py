import pytest
from rest_framework import status
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.dairies.models import Dairy
from apps.deliveries.models import DeliveryBoy

ME_URL = '/api/v1/auth/me/'
ACCOUNTS_URL = '/api/v1/auth/admin/accounts/'


def login(email, password='Password@123'):
    client = APIClient()
    res = client.post('/api/v1/auth/login/', {'email': email, 'password': password})
    return client, res


# --- Role isolation -------------------------------------------------------

@pytest.mark.django_db
def test_public_signup_cannot_choose_privileged_role(api_client):
    res = api_client.post('/api/v1/auth/signup/', {
        'email': 'sneaky@example.com',
        'password': 'Password@123',
        'full_name': 'Sneaky',
        'role': 'admin',
    })
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['user']['role'] == 'customer'
    assert User.objects.get(email='sneaky@example.com').role == User.Role.CUSTOMER


@pytest.mark.django_db
def test_user_cannot_change_own_role_or_email(customer_client, customer_user):
    res = customer_client.patch(ME_URL, {'role': 'admin', 'email': 'other@example.com', 'full_name': 'Renamed'})
    assert res.status_code == status.HTTP_200_OK
    customer_user.refresh_from_db()
    assert customer_user.role == User.Role.CUSTOMER
    assert customer_user.email == 'cust_test@gawali.app'
    assert customer_user.full_name == 'Renamed'


@pytest.mark.django_db
def test_profile_update_rejects_phone_in_use(customer_client, dairy_user):
    dairy_user.phone = '+919800000001'
    dairy_user.save()
    res = customer_client.patch(ME_URL, {'phone': '+919800000001'})
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_dairy_cannot_self_verify(dairy_client, dairy_user):
    dairy_user.dairy.is_verified = False
    dairy_user.dairy.save()
    res = dairy_client.patch('/api/v1/dairies/profile/', {'is_verified': True, 'is_active': True})
    assert res.status_code == status.HTTP_200_OK
    dairy_user.dairy.refresh_from_db()
    assert dairy_user.dairy.is_verified is False


@pytest.mark.django_db
@pytest.mark.parametrize('client_fixture', ['customer_client', 'dairy_client'])
def test_non_admins_cannot_manage_accounts(request, client_fixture):
    client = request.getfixturevalue(client_fixture)
    assert client.get(ACCOUNTS_URL).status_code == status.HTTP_403_FORBIDDEN
    res = client.post(ACCOUNTS_URL, {
        'role': 'dairy', 'full_name': 'X', 'email': 'x@example.com',
        'phone': '+919811111111', 'business_name': 'X Dairy',
    })
    assert res.status_code == status.HTTP_403_FORBIDDEN


# --- Admin provisioning ---------------------------------------------------

@pytest.mark.django_db
def test_admin_creates_dairy_owner_who_can_log_in(admin_client):
    res = admin_client.post(ACCOUNTS_URL, {
        'role': 'dairy',
        'full_name': 'Govind Sanas',
        'email': 'Govind@Dairy.com',
        'phone': '+919876500112',
        'business_name': 'Govind Milk Farm',
        'city': 'Kothrud, Pune',
    })
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['role'] == 'dairy'
    assert res.data['dairy_name'] == 'Govind Milk Farm'
    temp_password = res.data['temporary_password']
    assert len(temp_password) >= 8

    assert Dairy.objects.filter(user__email='govind@dairy.com', business_name='Govind Milk Farm').exists()
    _, login_res = login('govind@dairy.com', temp_password)
    assert login_res.status_code == status.HTTP_200_OK
    assert login_res.data['user']['role'] == 'dairy'


@pytest.mark.django_db
def test_admin_creates_gawali_linked_to_dairy(admin_client, dairy_user):
    res = admin_client.post(ACCOUNTS_URL, {
        'role': 'delivery_boy',
        'full_name': 'Suresh Kadam',
        'email': 'suresh@example.com',
        'phone': '+919876500113',
        'dairy_id': str(dairy_user.dairy.id),
        'password': 'Gawali@2026',
    })
    assert res.status_code == status.HTTP_201_CREATED
    assert res.data['dairy_id'] == str(dairy_user.dairy.id)
    assert DeliveryBoy.objects.get(user__email='suresh@example.com').dairy == dairy_user.dairy


@pytest.mark.django_db
def test_gawali_requires_existing_dairy(admin_client):
    res = admin_client.post(ACCOUNTS_URL, {
        'role': 'delivery_boy', 'full_name': 'No Dairy', 'email': 'nd@example.com', 'phone': '+919876500114',
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'dairy_id' in res.data['errors']


@pytest.mark.django_db
@pytest.mark.parametrize('role', ['admin', 'customer'])
def test_admin_endpoint_only_provisions_dairy_and_gawali(admin_client, role):
    res = admin_client.post(ACCOUNTS_URL, {
        'role': role, 'full_name': 'X', 'email': f'{role}@example.com', 'phone': '+919876500115',
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST


@pytest.mark.django_db
def test_admin_create_rejects_duplicate_email(admin_client, dairy_user):
    res = admin_client.post(ACCOUNTS_URL, {
        'role': 'dairy', 'full_name': 'Dup', 'email': dairy_user.email,
        'phone': '+919876500116', 'business_name': 'Dup Dairy',
    })
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    assert 'email' in res.data['errors']


@pytest.mark.django_db
def test_admin_suspends_account_and_login_is_blocked(admin_client, dairy_user):
    res = admin_client.patch(f'{ACCOUNTS_URL}{dairy_user.pk}/status/', {'is_active': False}, format='json')
    assert res.status_code == status.HTTP_200_OK
    assert res.data['is_active'] is False
    _, login_res = login(dairy_user.email)
    assert login_res.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_admin_cannot_suspend_admins_via_account_status(admin_client, admin_user):
    res = admin_client.patch(f'{ACCOUNTS_URL}{admin_user.pk}/status/', {'is_active': False}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST


# --- Logout & account deletion -------------------------------------------

@pytest.mark.django_db
def test_logout_revokes_refresh_token(customer_user):
    client, login_res = login(customer_user.email)
    refresh = login_res.data['refresh']
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

    assert client.post('/api/v1/auth/logout/', {'refresh': refresh}).status_code == status.HTTP_205_RESET_CONTENT
    reuse = APIClient().post('/api/v1/auth/token/refresh/', {'refresh': refresh})
    assert reuse.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_delete_account_requires_correct_password(customer_client, customer_user):
    res = customer_client.delete(ME_URL, {'password': 'wrong'}, format='json')
    assert res.status_code == status.HTTP_400_BAD_REQUEST
    customer_user.refresh_from_db()
    assert customer_user.is_active is True


@pytest.mark.django_db
def test_delete_account_anonymises_and_blocks_login(customer_user):
    client, login_res = login(customer_user.email)
    refresh = login_res.data['refresh']
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {login_res.data['access']}")

    res = client.delete(ME_URL, {'password': 'Password@123'}, format='json')
    assert res.status_code == status.HTTP_204_NO_CONTENT

    deleted = User.all_objects.get(pk=customer_user.pk)
    assert deleted.is_active is False
    assert deleted.is_deleted is True
    assert deleted.phone is None
    assert deleted.email != 'cust_test@gawali.app'
    assert deleted.customer_profile.is_active is False

    _, relogin = login('cust_test@gawali.app')
    assert relogin.status_code == status.HTTP_401_UNAUTHORIZED
    assert APIClient().post('/api/v1/auth/token/refresh/', {'refresh': refresh}).status_code == status.HTTP_401_UNAUTHORIZED
    # Old access token no longer authenticates either.
    assert client.get(ME_URL).status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
def test_deleted_email_can_register_again(customer_client, api_client):
    customer_client.delete(ME_URL, {'password': 'Password@123'}, format='json')
    res = api_client.post('/api/v1/auth/signup/', {
        'email': 'cust_test@gawali.app', 'password': 'Password@123', 'full_name': 'Back Again',
    })
    assert res.status_code == status.HTTP_201_CREATED


@pytest.mark.django_db
def test_dairy_deletion_deactivates_dairy(dairy_client, dairy_user):
    res = dairy_client.delete(ME_URL, {'password': 'Password@123'}, format='json')
    assert res.status_code == status.HTTP_204_NO_CONTENT
    assert Dairy.objects.get(pk=dairy_user.dairy.pk).is_active is False


@pytest.mark.django_db
def test_last_admin_cannot_delete_account(admin_client):
    res = admin_client.delete(ME_URL, {'password': 'Password@123'}, format='json')
    assert res.status_code == status.HTTP_409_CONFLICT
