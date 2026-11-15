import secrets
import string

from django.db import transaction
from django.utils import timezone
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from .models import User


def generate_temporary_password(length: int = 12) -> str:
    """Random password handed to admin-provisioned accounts; always contains a letter and a digit."""
    alphabet = string.ascii_letters + string.digits
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(length))
        if any(c.isalpha() for c in password) and any(c.isdigit() for c in password):
            return password


def revoke_all_tokens(user: User) -> None:
    """Blacklist every outstanding refresh token so no device can obtain new access tokens."""
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@transaction.atomic
def delete_account(user: User) -> None:
    """
    Close an account: deactivate it, strip personal data and revoke sessions.

    The row is soft-deleted rather than removed so bills, payments and audit
    history that reference it stay intact.
    """
    if user.role == User.Role.DAIRY and hasattr(user, 'dairy'):
        user.dairy.is_active = False
        user.dairy.save(update_fields=['is_active', 'updated_at'])
    elif user.role == User.Role.DELIVERY_BOY and hasattr(user, 'delivery_profile'):
        user.delivery_profile.is_active = False
        user.delivery_profile.save(update_fields=['is_active', 'updated_at'])
    elif user.role == User.Role.CUSTOMER and hasattr(user, 'customer_profile'):
        user.customer_profile.is_active = False
        user.customer_profile.save(update_fields=['is_active', 'updated_at'])

    revoke_all_tokens(user)

    user.email = f'deleted-{user.pk}@deleted.gawali.invalid'
    user.phone = None
    user.full_name = 'Deleted user'
    user.avatar_url = None
    user.is_active = False
    user.is_deleted = True
    user.deleted_at = timezone.now()
    user.set_unusable_password()
    user.save()


def is_last_active_admin(user: User) -> bool:
    return (
        user.role == User.Role.ADMIN
        and not User.objects.filter(role=User.Role.ADMIN, is_active=True, is_deleted=False).exclude(pk=user.pk).exists()
    )
