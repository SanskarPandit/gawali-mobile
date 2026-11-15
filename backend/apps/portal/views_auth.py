from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from rest_framework import permissions, status
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken

from apps.accounts.models import User
from apps.accounts.serializers import UserSerializer
from apps.customers.models import CustomerProfile
from apps.dairies.models import Dairy
from apps.wallet.services import get_wallet
from .common import require


class PublicDairiesView(APIView):
    """Dairies a new customer can subscribe to."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        return Response([{
            'id': str(d.id), 'name': d.business_name, 'city': d.city, 'pincode': d.pincode,
            'hub_name': d.hub_name, 'cutoff_time': d.cutoff_time.strftime('%H:%M'),
        } for d in Dairy.objects.filter(is_active=True, is_verified=True).order_by('business_name')])


class SignupView(APIView):
    """
    Self-signup for customers and dairy owners (gawalis). Delivery partners are invited by
    their dairy, so they never sign up here.
    """
    permission_classes = [permissions.AllowAny]
    throttle_scope = 'signup'

    def post(self, request):
        data = request.data
        role = data.get('role', 'customer')
        if role not in ('customer', 'dairy'):
            raise ValidationError({'role': ['Sign up as a customer or a dairy. Delivery partners are added by their dairy.']})
        require(data, 'full_name', 'email', 'phone', 'password')
        email = data['email'].strip().lower()
        phone = data['phone'].strip()
        if User.all_objects.filter(email=email).exists():
            raise ValidationError({'email': ['An account with this email already exists.']})
        if User.all_objects.filter(phone=phone).exists():
            raise ValidationError({'phone': ['This phone number is already registered.']})
        try:
            validate_password(data['password'], User(email=email, full_name=data['full_name']))
        except DjangoValidationError as exc:
            raise ValidationError({'password': list(exc.messages)})

        with transaction.atomic():
            if role == 'customer':
                require(data, 'dairy_id', 'address')
                dairy = Dairy.objects.filter(id=data['dairy_id'], is_active=True).first()
                if dairy is None:
                    raise ValidationError({'dairy_id': ['Choose a dairy that delivers to you.']})
                user = User.objects.create_user(email=email, password=data['password'], phone=phone,
                                                full_name=data['full_name'].strip(), role=User.Role.CUSTOMER)
                profile = CustomerProfile.objects.create(
                    user=user, dairy=dairy, address=data['address'].strip(),
                    flat_or_house_number=data.get('flat_or_house_number', '').strip(),
                    landmark=data.get('landmark', '').strip(), society_name=data.get('society_name', '').strip(),
                    society_gate_pass=bool(data.get('society_name')),
                    route_stop_order=CustomerProfile.objects.filter(dairy=dairy).count() + 1,
                )
                get_wallet(profile)
            else:
                require(data, 'business_name', 'address')
                user = User.objects.create_user(email=email, password=data['password'], phone=phone,
                                                full_name=data['full_name'].strip(), role=User.Role.DAIRY)
                Dairy.objects.create(
                    user=user, business_name=data['business_name'].strip(), phone=phone, is_verified=False,
                    address=data['address'].strip(), city=data.get('city', '').strip() or 'Pune',
                    pincode=data.get('pincode', '').strip(), hub_name=data.get('hub_name', '').strip() or
                    f"{data['business_name'].strip()} Hub #1",
                )

        if role == 'dairy':
            from apps.notifications.models import Notification
            Notification.objects.bulk_create([Notification(
                user=a, title='New dairy awaiting approval', body=f"{data['business_name'].strip()} ({email}) signed up.")
                for a in User.objects.filter(role=User.Role.ADMIN, is_active=True)])
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=status.HTTP_201_CREATED)
