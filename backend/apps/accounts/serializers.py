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
    password = serializers.CharField(write_only=True, min_length=6)

    class Meta:
        model = User
        fields = ['id', 'email', 'phone', 'full_name', 'role', 'password']

    def create(self, validated_data):
        password = validated_data.pop('password')
        user = User.objects.create_user(password=password, **validated_data)
        return user

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
