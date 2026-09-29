import pytest
from rest_framework import status
from django.utils import timezone
from datetime import timedelta

@pytest.mark.django_db
def test_calendar_month_view(customer_client, customer_subscription):
    now = timezone.localtime()
    response = customer_client.get(f'/api/v1/subscriptions/calendar/?year={now.year}&month={now.month}')
    assert response.status_code == status.HTTP_200_OK
    assert response.data['has_subscription'] is True
    assert len(response.data['days']) >= 28

@pytest.mark.django_db
def test_set_override_future_date_skip(customer_client, customer_subscription):
    future_date = (timezone.localdate() + timedelta(days=2)).isoformat()
    payload = {
        'date': future_date,
        'quantity': 0.0,
        'override_type': 'skip'
    }
    response = customer_client.post('/api/v1/subscriptions/override/', payload)
    assert response.status_code == status.HTTP_200_OK
    assert response.data['success'] is True
    assert response.data['override']['override_type'] == 'skip'

@pytest.mark.django_db
def test_cutoff_past_date_rejected(customer_client, customer_subscription):
    past_date = (timezone.localdate() - timedelta(days=1)).isoformat()
    payload = {
        'date': past_date,
        'quantity': 0.0
    }
    response = customer_client.post('/api/v1/subscriptions/override/', payload)
    assert response.status_code == status.HTTP_400_BAD_REQUEST

@pytest.mark.django_db
def test_vacation_pause_and_cancel(customer_client, customer_subscription):
    start = (timezone.localdate() + timedelta(days=3)).isoformat()
    end = (timezone.localdate() + timedelta(days=7)).isoformat()

    # 1. Create vacation
    create_res = customer_client.post('/api/v1/subscriptions/vacations/', {
        'start_date': start,
        'end_date': end,
        'reason': 'Family trip to Konkan'
    })
    assert create_res.status_code == status.HTTP_201_CREATED
    vac_id = create_res.data['id']

    # 2. Delete vacation
    del_res = customer_client.delete(f'/api/v1/subscriptions/vacations/{vac_id}/')
    assert del_res.status_code == status.HTTP_204_NO_CONTENT
