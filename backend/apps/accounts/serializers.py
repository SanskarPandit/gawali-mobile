from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from django.contrib.auth import authenticate
from django.utils import timezone
from datetime import timedelta
import random
from .models import User, OTPCode

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'phone', 'full_name', 'role', 'avatar_url', 'is_phone_verified', 'is_email_verified', 'created_at']
        read_only_fields = ['id', 'created_at', 'is_phone_verified', 'is_email_verified']

class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data

class RegisterSerializer(serializers.ModelSerializer):
    """Public self-signup. Always creates a customer: privileged roles are provisioned by admins only."""
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'email', 'phone', 'full_name', 'role', 'password']
        read_only_fields = ['id', 'role']

    def validate_email(self, value):
        value = value.lower().strip()
        if User.all_objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def create(self, validated_data):
        password = validated_data.pop('password')
        validated_data['role'] = User.Role.CUSTOMER
        return User.objects.create_user(password=password, **validated_data)


class ProfileUpdateSerializer(serializers.ModelSerializer):
    """Fields a user may change on their own account. Role, email and verification flags are never self-editable."""

    class Meta:
        model = User
        fields = ['full_name', 'phone', 'avatar_url']

    def validate_full_name(self, value):
        value = value.strip()
        if not value:
            raise serializers.ValidationError('Name cannot be empty.')
        return value

    def validate_phone(self, value):
        if not value:
            return None
        value = value.strip()
        if User.all_objects.filter(phone=value).exclude(pk=self.instance.pk).exists():
            raise serializers.ValidationError('This phone number is already in use.')
        return value


class DeleteAccountSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)

    def validate_password(self, value):
        if not self.context['request'].user.check_password(value):
            raise serializers.ValidationError('Password is incorrect.')
        return value


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class AdminAccountSerializer(serializers.ModelSerializer):
    """Account directory row for the platform admin."""
    dairy_id = serializers.SerializerMethodField()
    dairy_name = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'phone', 'full_name', 'role', 'is_active', 'dairy_id', 'dairy_name', 'created_at']
        read_only_fields = fields

    def _dairy(self, obj):
        if obj.role == User.Role.DAIRY:
            return getattr(obj, 'dairy', None)
        if obj.role == User.Role.DELIVERY_BOY:
            profile = getattr(obj, 'delivery_profile', None)
            return profile.dairy if profile else None
        return None

    def get_dairy_id(self, obj):
        dairy = self._dairy(obj)
        return str(dairy.id) if dairy else None

    def get_dairy_name(self, obj):
        dairy = self._dairy(obj)
        return dairy.business_name if dairy else None


class AdminAccountCreateSerializer(serializers.Serializer):
    """Admin-only provisioning of dairy owners and gawalis (delivery staff)."""
    ROLE_CHOICES = [User.Role.DAIRY, User.Role.DELIVERY_BOY]

    role = serializers.ChoiceField(choices=ROLE_CHOICES)
    full_name = serializers.CharField(max_length=255)
    email = serializers.EmailField()
    phone = serializers.CharField(max_length=20)
    password = serializers.CharField(min_length=8, required=False, write_only=True)

    # Dairy owner fields
    business_name = serializers.CharField(max_length=255, required=False)
    address = serializers.CharField(required=False, allow_blank=True)
    city = serializers.CharField(max_length=100, required=False, allow_blank=True)
    pincode = serializers.CharField(max_length=10, required=False, allow_blank=True)

    # Gawali fields
    dairy_id = serializers.UUIDField(required=False)
    vehicle_number = serializers.CharField(max_length=50, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.all_objects.filter(email=value).exists():
            raise serializers.ValidationError('An account with this email already exists.')
        return value

    def validate_phone(self, value):
        value = value.strip()
        if User.all_objects.filter(phone=value).exists():
            raise serializers.ValidationError('This phone number is already in use.')
        return value

    def validate(self, attrs):
        from apps.dairies.models import Dairy

        if attrs['role'] == User.Role.DAIRY:
            if not attrs.get('business_name', '').strip():
                raise serializers.ValidationError({'business_name': 'Dairy name is required.'})
        else:
            dairy = Dairy.objects.filter(id=attrs.get('dairy_id'), is_active=True).first() if attrs.get('dairy_id') else None
            if not dairy:
                raise serializers.ValidationError({'dairy_id': 'Select an active dairy for this gawali.'})
            attrs['dairy'] = dairy
        return attrs

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)

    def validate(self, attrs):
        email = attrs.get('email').lower().strip()
        password = attrs.get('password')
        user = authenticate(username=email, password=password)
        if not user:
            raise serializers.ValidationError('Invalid email or password.')
        if not user.is_active:
            raise serializers.ValidationError('This account has been deactivated.')
        attrs['user'] = user
        return attrs

class OTPSendSerializer(serializers.Serializer):
    destination = serializers.CharField(max_length=255) # Phone or Email

    def create_otp(self):
        dest = self.validated_data['destination'].strip()
        code = f"{random.randint(100000, 999999)}"
        expires_at = timezone.now() + timedelta(minutes=10)
        otp = OTPCode.objects.create(destination=dest, code=code, expires_at=expires_at)
        return otp

class OTPVerifySerializer(serializers.Serializer):
    destination = serializers.CharField(max_length=255)
    code = serializers.CharField(max_length=6)

    def validate(self, attrs):
        dest = attrs.get('destination').strip()
        code = attrs.get('code').strip()
        otp = OTPCode.objects.filter(destination=dest, code=code, is_used=False).order_by('-created_at').first()
        if not otp or not otp.is_valid():
            raise serializers.ValidationError('Invalid or expired OTP.')
        attrs['otp'] = otp
        return attrs

class ChangePasswordSerializer(serializers.Serializer):
    old_password = serializers.CharField(required=True)
    new_password = serializers.CharField(required=True, min_length=6)
