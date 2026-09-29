import pytest
from rest_framework import status

@pytest.mark.django_db
def test_register_customer(api_client):
    payload = {
        'email': 'new_user@gawali.app',
        'password': 'SecurePassword@123',
        'full_name': 'New Customer',
        'phone': '+919811223344',
        'role': 'customer'
    }
    response = api_client.post('/api/v1/auth/signup/', payload)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data['success'] is True
    assert 'tokens' in response.data
    assert response.data['user']['email'] == 'new_user@gawali.app'

@pytest.mark.django_db
def test_login_success_and_jwt(api_client, customer_user):
    payload = {
        'email': customer_user.email,
        'password': 'Password@123'
    }
    response = api_client.post('/api/v1/auth/login/', payload)
    assert response.status_code == status.HTTP_200_OK
    assert 'access' in response.data
    assert 'refresh' in response.data
    assert response.data['user']['role'] == 'customer'

@pytest.mark.django_db
def test_login_invalid_password(api_client, customer_user):
    payload = {
        'email': customer_user.email,
        'password': 'WrongPassword'
    }
    response = api_client.post('/api/v1/auth/login/', payload)
    assert response.status_code == status.HTTP_401_UNAUTHORIZED

@pytest.mark.django_db
def test_get_me_profile(customer_client, customer_user):
    response = customer_client.get('/api/v1/auth/me/')
    assert response.status_code == status.HTTP_200_OK
    assert response.data['email'] == customer_user.email
    assert response.data['role'] == 'customer'
    assert 'customer_id' in response.data

@pytest.mark.django_db
def test_otp_flow(api_client):
    # 1. Send OTP
    send_res = api_client.post('/api/v1/auth/otp/send/', {'destination': '+919876500000'})
    assert send_res.status_code == status.HTTP_200_OK
    dev_otp = send_res.data['dev_otp']
    assert len(dev_otp) == 6

    # 2. Verify OTP
    verify_res = api_client.post('/api/v1/auth/otp/verify/', {
        'destination': '+919876500000',
        'code': dev_otp
    })
    assert verify_res.status_code == status.HTTP_200_OK
    assert verify_res.data['success'] is True
    assert 'tokens' in verify_res.data
