from django.urls import path
from .views import DairyReportsView, ExportReportsCsvView

urlpatterns = [
    path('vendor/', DairyReportsView.as_view(), name='dairy_reports'),
    path('vendor/csv/', ExportReportsCsvView.as_view(), name='dairy_reports_csv'),
]
