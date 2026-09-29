from django.urls import path
from .views import (
    CustomerBillsListView,
    CustomerBillDetailView,
    DownloadBillPdfView,
    DairyGenerateBillView,
    DairyMarkBillPaidView,
)

urlpatterns = [
    path('my-bills/', CustomerBillsListView.as_view(), name='customer_bills_list'),
    path('my-bills/<uuid:pk>/', CustomerBillDetailView.as_view(), name='customer_bill_detail'),
    path('<uuid:pk>/pdf/', DownloadBillPdfView.as_view(), name='download_bill_pdf'),
    path('vendor/generate/<uuid:customer_id>/', DairyGenerateBillView.as_view(), name='dairy_generate_bill'),
    path('vendor/mark-paid/<uuid:pk>/', DairyMarkBillPaidView.as_view(), name='dairy_mark_bill_paid'),
]
