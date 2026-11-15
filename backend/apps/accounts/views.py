from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.conf import settings
from django.db import transaction
from drf_spectacular.utils import extend_schema, OpenApiResponse
from apps.core.permissions import IsAdminUser
from .models import User
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    ProfileUpdateSerializer,
    DeleteAccountSerializer,
    LogoutSerializer,
    AdminAccountSerializer,
    AdminAccountCreateSerializer,
    CustomTokenObtainPairSerializer,
    OTPSendSerializer,
    OTPVerifySerializer,
    ChangePasswordSerializer,
)
from . import services

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer
    throttle_scope = 'login'

class RegisterView(generics.CreateAPIView):
    queryset = User.objects.all()
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        refresh = RefreshToken.for_user(user)
        return Response({
            'success': True,
            'message': 'Account registered successfully',
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        }, status=status.HTTP_201_CREATED)

class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(responses={200: UserSerializer})
    def get(self, request):
        user = request.user
        data = UserSerializer(user).data
        # Attach role specific entity IDs
        if user.role == User.Role.DAIRY and hasattr(user, 'dairy'):
            data['dairy_id'] = str(user.dairy.id)
            data['business_name'] = user.dairy.business_name
        elif user.role == User.Role.CUSTOMER and hasattr(user, 'customer_profile'):
            data['customer_id'] = str(user.customer_profile.id)
            data['dairy_id'] = str(user.customer_profile.dairy.id) if user.customer_profile.dairy else None
        elif user.role == User.Role.DELIVERY_BOY and hasattr(user, 'delivery_profile'):
            data['delivery_boy_id'] = str(user.delivery_profile.id)
            data['dairy_id'] = str(user.delivery_profile.dairy.id)
        return Response(data)

    @extend_schema(request=ProfileUpdateSerializer, responses={200: UserSerializer})
    def patch(self, request):
        serializer = ProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return self.get(request)

    @extend_schema(request=DeleteAccountSerializer, responses={204: OpenApiResponse(description='Account deleted')})
    def delete(self, request):
        serializer = DeleteAccountSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        if services.is_last_active_admin(request.user):
            return Response(
                {'detail': 'You are the only active admin. Add another admin before deleting this account.'},
                status=status.HTTP_409_CONFLICT,
            )
        services.delete_account(request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class LogoutView(APIView):
    """Revokes the refresh token so the session cannot be renewed."""
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=LogoutSerializer, responses={205: OpenApiResponse(description='Logged out')})
    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = RefreshToken(serializer.validated_data['refresh'])
        except TokenError:
            return Response({'detail': 'Invalid or expired refresh token.'}, status=status.HTTP_400_BAD_REQUEST)
        if str(token.get('user_id')) != str(request.user.pk):
            return Response({'detail': 'Token does not belong to this user.'}, status=status.HTTP_403_FORBIDDEN)
        token.blacklist()
        return Response(status=status.HTTP_205_RESET_CONTENT)


class AdminAccountListCreateView(generics.ListCreateAPIView):
    """Admin directory of accounts, and provisioning of dairy owners and gawalis."""
    permission_classes = [IsAdminUser]
    serializer_class = AdminAccountSerializer

    def get_queryset(self):
        qs = User.objects.filter(is_deleted=False).select_related('dairy', 'delivery_profile__dairy')
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role=role)
        return qs

    @extend_schema(request=AdminAccountCreateSerializer, responses={201: AdminAccountSerializer})
    def create(self, request, *args, **kwargs):
        from apps.dairies.models import Dairy
        from apps.deliveries.models import DeliveryBoy

        serializer = AdminAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        password = data.get('password') or services.generate_temporary_password()

        with transaction.atomic():
            user = User.objects.create_user(
                email=data['email'],
                password=password,
                full_name=data['full_name'].strip(),
                phone=data['phone'],
                role=data['role'],
            )
            if data['role'] == User.Role.DAIRY:
                Dairy.objects.create(
                    user=user,
                    business_name=data['business_name'].strip(),
                    phone=data['phone'],
                    address=data.get('address', ''),
                    city=data.get('city') or 'Pune',
                    pincode=data.get('pincode', ''),
                )
            else:
                DeliveryBoy.objects.create(
                    user=user,
                    dairy=data['dairy'],
                    vehicle_number=data.get('vehicle_number', ''),
                )

        body = AdminAccountSerializer(user).data
        # Returned once so the admin can hand it to the new account holder.
        body['temporary_password'] = password
        return Response(body, status=status.HTTP_201_CREATED)


class AdminAccountStatusView(APIView):
    """Admin can suspend or reactivate a dairy owner or gawali account."""
    permission_classes = [IsAdminUser]

    def patch(self, request, pk):
        user = User.objects.filter(pk=pk, is_deleted=False).first()
        if not user:
            return Response({'detail': 'Account not found.'}, status=status.HTTP_404_NOT_FOUND)
        if user.role not in (User.Role.DAIRY, User.Role.DELIVERY_BOY):
            return Response(
                {'detail': 'Only dairy and gawali accounts can be managed here.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        is_active = request.data.get('is_active')
        if not isinstance(is_active, bool):
            return Response({'detail': 'is_active must be true or false.'}, status=status.HTTP_400_BAD_REQUEST)

        user.is_active = is_active
        user.save(update_fields=['is_active', 'updated_at'])
        if not is_active:
            services.revoke_all_tokens(user)
        return Response(AdminAccountSerializer(user).data)

class OTPSendView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        otp = serializer.create_otp()
        body = {
            'success': True,
            'message': 'OTP sent successfully',
            'destination': otp.destination,
        }
        # Never expose the code outside local development: it would let anyone log in as anyone.
        if settings.DEBUG:
            body['dev_otp'] = otp.code
        return Response(body)

class OTPVerifyView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        otp = serializer.validated_data['otp']
        otp.is_used = True
        otp.save()

        # Find or create user
        dest = otp.destination
        is_phone = dest.replace('+', '').isdigit()
        if is_phone:
            user = User.objects.filter(phone=dest).first()
            if not user:
                user = User.objects.create_user(
                    email=f"{dest}@gawali.local",
                    phone=dest,
                    full_name=f"Customer {dest[-4:]}",
                    role=User.Role.CUSTOMER,
                    is_phone_verified=True
                )
            else:
                user.is_phone_verified = True
                user.save(update_fields=['is_phone_verified'])
        else:
            user = User.objects.filter(email=dest.lower()).first()
            if not user:
                user = User.objects.create_user(
                    email=dest.lower(),
                    full_name=dest.split('@')[0].capitalize(),
                    role=User.Role.CUSTOMER,
                    is_email_verified=True
                )
            else:
                user.is_email_verified = True
                user.save(update_fields=['is_email_verified'])

        if not user.is_active or user.is_deleted:
            return Response({'detail': 'This account has been deactivated.'}, status=status.HTTP_403_FORBIDDEN)

        refresh = RefreshToken.for_user(user)
        return Response({
            'success': True,
            'message': 'OTP verified successfully',
            'user': UserSerializer(user).data,
            'tokens': {
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }
        })

class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user
        if not user.check_password(serializer.validated_data['old_password']):
            return Response({'detail': 'Current password does not match.'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(serializer.validated_data['new_password'])
        user.save()
        return Response({'success': True, 'message': 'Password updated successfully.'})
