import pytest
from rest_framework import status

@pytest.mark.django_db
def test_admin_dashboard_stats(admin_client, dairy_user, customer_subscription):
    response = admin_client.get('/api/v1/dairies/admin/dashboard/')
    assert response.status_code == status.HTTP_200_OK
    assert 'metrics' in response.data
    assert response.data['metrics']['total_dairies'] >= 1
    assert 'dairies' in response.data

@pytest.mark.django_db
def test_admin_update_dairy_status(admin_client, dairy_user):
    dairy_id = str(dairy_user.dairy.id)
    response = admin_client.patch(f'/api/v1/dairies/admin/{dairy_id}/status/', {
        'is_verified': True,
        'is_active': False
    }, format='json')
    assert response.status_code == status.HTTP_200_OK
    assert response.data['is_active'] is False

@pytest.mark.django_db
def test_customer_cannot_access_admin_endpoints(customer_client):
    response = customer_client.get('/api/v1/dairies/admin/dashboard/')
    assert response.status_code == status.HTTP_403_FORBIDDEN
