import pytest
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
import decimal
from apps.billing.models import Bill, BillItem
from apps.billing.tasks import generate_bill_for_customer_month

@pytest.fixture
def sample_bill(db, customer_user, dairy_user):
    month_start = timezone.localdate().replace(day=1)
    bill = Bill.objects.create(
        customer=customer_user.customer_profile,
        dairy=dairy_user.dairy,
        billing_month=month_start,
        total_quantity=decimal.Decimal('42.00'),
        total_amount=decimal.Decimal('2940.00'),
        paid_amount=decimal.Decimal('0.00'),
        due_amount=decimal.Decimal('2940.00'),
        status=Bill.Status.GENERATED
    )
    BillItem.objects.create(
        bill=bill,
        date=month_start,
        item_name='Cow Milk A2',
        quantity=decimal.Decimal('42.00'),
        unit_price=decimal.Decimal('70.00'),
        total_amount=decimal.Decimal('2940.00')
    )
    return bill

@pytest.mark.django_db
def test_customer_bills_summary(customer_client, sample_bill):
    response = customer_client.get('/api/v1/billing/my-bills/')
    assert response.status_code == status.HTTP_200_OK
    assert response.data['summary']['total_billed'] == 2940.0
    assert response.data['summary']['total_due'] == 2940.0
    assert len(response.data['bills']) == 1

@pytest.mark.django_db
def test_download_bill_pdf(customer_client, sample_bill):
    response = customer_client.get(f'/api/v1/billing/{sample_bill.id}/pdf/')
    assert response.status_code == status.HTTP_200_OK
    assert response['Content-Type'] == 'application/pdf'
    assert len(response.content) > 1000

@pytest.mark.django_db
def test_razorpay_payment_initiate_and_verify(customer_client, sample_bill):
    # 1. Initiate
    init_res = customer_client.post('/api/v1/payments/initiate/', {'bill_id': str(sample_bill.id)})
    assert init_res.status_code == status.HTTP_200_OK
    order_id = init_res.data['razorpay_order_id']
    assert order_id.startswith('order_')

    # 2. Verify with mock signature
    verify_res = customer_client.post('/api/v1/payments/verify/', {
        'bill_id': str(sample_bill.id),
        'razorpay_order_id': order_id,
        'razorpay_payment_id': 'pay_test_123',
        'razorpay_signature': 'mock_signature_valid'
    })
    assert verify_res.status_code == status.HTTP_200_OK
    assert verify_res.data['success'] is True
    assert verify_res.data['bill']['due_amount'] == 0.0

@pytest.mark.django_db
def test_dairy_mark_bill_paid_cash(dairy_client, sample_bill):
    response = dairy_client.post(f'/api/v1/billing/vendor/mark-paid/{sample_bill.id}/', {
        'mark_full': True,
        'notes': 'Paid cash to delivery boy'
    })
    assert response.status_code == status.HTTP_200_OK
    assert float(response.data['bill']['due_amount']) == 0.0
    assert response.data['bill']['is_paid'] is True
