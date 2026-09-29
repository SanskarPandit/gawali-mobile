from rest_framework import status, generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema, OpenApiResponse
from .models import User
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    CustomTokenObtainPairSerializer,
    OTPSendSerializer,
    OTPVerifySerializer,
    ChangePasswordSerializer,
)

class CustomTokenObtainPairView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

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

    def patch(self, request):
        user = request.user
        serializer = UserSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

class OTPSendView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        serializer = OTPSendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        otp = serializer.create_otp()
        # In development / testing, return code in response; in prod, integrate SMS provider
        return Response({
            'success': True,
            'message': 'OTP sent successfully',
            'destination': otp.destination,
            'dev_otp': otp.code # For easy testing
        })

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
