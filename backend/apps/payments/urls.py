from django.urls import path
from .views import (
    InitiatePaymentView,
    VerifyPaymentView,
    CustomerPaymentHistoryView,
)

urlpatterns = [
    path('initiate/', InitiatePaymentView.as_view(), name='initiate_payment'),
    path('verify/', VerifyPaymentView.as_view(), name='verify_payment'),
    path('history/', CustomerPaymentHistoryView.as_view(), name='payment_history'),
]
