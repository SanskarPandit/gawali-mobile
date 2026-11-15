from django.urls import path

from . import views_auth as a
from . import views_customer as c
from . import views_dairy as d
from . import views_delivery as p
from .views_ai import AIStatusView, ConfigView

urlpatterns = [
    path('auth/signup/', a.SignupView.as_view()),
    path('auth/dairies/', a.PublicDairiesView.as_view()),
    path('ai/status/', AIStatusView.as_view()),
    path('config/', ConfigView.as_view()),

    # Customer
    path('customer/home/', c.HomeView.as_view()),
    path('customer/week/', c.WeekView.as_view()),
    path('customer/day/<str:day>/quantity/', c.DayQuantityView.as_view()),
    path('customer/day/<str:day>/skip/', c.DaySkipView.as_view()),
    path('customer/day/<str:day>/swap/', c.DaySwapView.as_view()),
    path('customer/orders/', c.OrdersView.as_view()),
    path('customer/orders/<uuid:pk>/cancel/', c.OrderCancelView.as_view()),
    path('customer/subscriptions/', c.SubscriptionsView.as_view()),
    path('customer/subscriptions/<uuid:pk>/', c.SubscriptionDetailView.as_view()),
    path('customer/vacations/', c.VacationsView.as_view()),
    path('customer/vacations/preview/', c.VacationPreviewView.as_view()),
    path('customer/vacations/<uuid:pk>/', c.VacationDetailView.as_view()),
    path('customer/shop/', c.ShopView.as_view()),
    path('customer/wallet/', c.WalletView.as_view()),
    path('customer/wallet/topup/', c.WalletTopupView.as_view()),
    path('customer/wallet/withdraw/', c.WalletWithdrawView.as_view()),
    path('customer/bottles/', c.BottlesView.as_view()),
    path('customer/passport/', c.PassportView.as_view()),
    path('customer/refunds/', c.RefundsView.as_view()),
    path('customer/refunds/<uuid:pk>/backup/', c.RefundBackupView.as_view()),
    path('customer/profile/', c.ProfileView.as_view()),
    path('customer/assistant/', c.AssistantView.as_view()),
    path('customer/assistant/apply/', c.AssistantApplyView.as_view()),
    path('batches/<uuid:pk>/pdf/', c.PassportPdfView.as_view()),

    # Dairy (gawali)
    path('dairy/overview/', d.OverviewView.as_view()),
    path('dairy/insights/', d.InsightsView.as_view()),
    path('dairy/manifest/', d.ManifestView.as_view()),
    path('dairy/manifest/generate/', d.GenerateManifestView.as_view()),
    path('dairy/customers/', d.CustomersView.as_view()),
    path('dairy/customers/<uuid:pk>/', d.CustomerDetailView.as_view()),
    path('dairy/customers/<uuid:pk>/subscriptions/', d.CustomerSubscriptionView.as_view()),
    path('dairy/customers/<uuid:pk>/payments/', d.CustomerPaymentView.as_view()),
    path('dairy/subscriptions/<uuid:pk>/', d.CustomerSubscriptionView.as_view()),
    path('dairy/products/', d.ProductsView.as_view()),
    path('dairy/products/<uuid:pk>/', d.ProductDetailView.as_view()),
    path('dairy/routes/', d.RoutesView.as_view()),
    path('dairy/routes/<uuid:pk>/', d.RouteDetailView.as_view()),
    path('dairy/routes/<uuid:pk>/reorder/', d.RouteReorderView.as_view()),
    path('dairy/partners/', d.PartnersView.as_view()),
    path('dairy/partners/<uuid:pk>/', d.PartnerDetailView.as_view()),
    path('dairy/batches/', d.BatchesView.as_view()),
    path('dairy/batches/parse-report/', d.BatchParseReportView.as_view()),
    path('dairy/batches/<uuid:pk>/readings/', d.BatchReadingView.as_view()),
    path('dairy/refunds/', d.RefundsReviewView.as_view()),
    path('dairy/refunds/<uuid:pk>/decision/', d.RefundDecisionView.as_view()),
    path('dairy/finance/', d.FinanceView.as_view()),
    path('dairy/settings/', d.SettingsView.as_view()),

    # Delivery partner
    path('delivery/route/', p.RouteView.as_view()),
    path('delivery/brief/', p.BriefView.as_view()),
    path('delivery/stops/<uuid:pk>/complete/', p.CompleteStopView.as_view()),
    path('delivery/stops/<uuid:pk>/reopen/', p.ReopenStopView.as_view()),
    path('delivery/history/', p.HistoryView.as_view()),
    path('delivery/profile/', p.PartnerProfileView.as_view()),
]
