import pytest
from rest_framework import status
from django.utils import timezone
from apps.deliveries.models import DailyDelivery

@pytest.mark.django_db
def test_dairy_dashboard_metrics(dairy_client, customer_subscription):
    response = dairy_client.get('/api/v1/dairies/dashboard/')
    assert response.status_code == status.HTTP_200_OK
    assert 'today_volume_litres' in response.data
    assert 'this_month_earned' in response.data
    assert 'overdue_customers' in response.data

@pytest.mark.django_db
def test_today_deliveries_and_status_toggle(dairy_client, customer_subscription):
    # 1. Fetch today deliveries list
    list_res = dairy_client.get('/api/v1/deliveries/today/')
    assert list_res.status_code == status.HTTP_200_OK
    results = list_res.data['results']
    assert len(results) >= 1
    deliv_id = results[0]['id']

    # 2. Toggle status to delivered
    patch_res = dairy_client.patch(f'/api/v1/deliveries/{deliv_id}/status/', {
        'status': 'delivered',
        'delivered_quantity': 1.5
    })
    assert patch_res.status_code == status.HTTP_200_OK
    assert patch_res.data['delivery']['status'] == 'delivered'

@pytest.mark.django_db
def test_dairy_product_crud(dairy_client):
    # Create product
    res = dairy_client.post('/api/v1/products/vendor/', {
        'name': 'Artisanal Shrikhand 250g',
        'unit': 'pack',
        'price_per_unit': '80.00',
        'kind': 'one_time'
    })
    assert res.status_code == status.HTTP_201_CREATED
    prod_id = res.data['id']

    # Update product
    up_res = dairy_client.patch(f'/api/v1/products/vendor/{prod_id}/', {'price_per_unit': '85.00'})
    assert up_res.status_code == status.HTTP_200_OK
    assert float(up_res.data['price_per_unit']) == 85.0

@pytest.mark.django_db
def test_reports_and_csv_export(dairy_client, customer_subscription):
    # JSON report
    rep_res = dairy_client.get('/api/v1/reports/vendor/?preset=this_month')
    assert rep_res.status_code == status.HTTP_200_OK
    assert 'summary' in rep_res.data
    assert 'delivered_litres' in rep_res.data['summary']

    # CSV report
    csv_res = dairy_client.get('/api/v1/reports/vendor/csv/?preset=this_month')
    assert csv_res.status_code == status.HTTP_200_OK
    assert csv_res['Content-Type'] == 'text/csv'
    assert 'Date,Customer Name' in csv_res.content.decode('utf-8')
