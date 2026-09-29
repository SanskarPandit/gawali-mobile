from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    CustomTokenObtainPairView,
    RegisterView,
    MeView,
    OTPSendView,
    OTPVerifyView,
    ChangePasswordView,
)

urlpatterns = [
    path('login/', CustomTokenObtainPairView.as_view(), name='auth_login'),
    path('signup/', RegisterView.as_view(), name='auth_signup'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('me/', MeView.as_view(), name='auth_me'),
    path('otp/send/', OTPSendView.as_view(), name='auth_otp_send'),
    path('otp/verify/', OTPVerifyView.as_view(), name='auth_otp_verify'),
    path('change-password/', ChangePasswordView.as_view(), name='auth_change_password'),
]
