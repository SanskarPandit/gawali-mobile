from datetime import date
from decimal import Decimal, InvalidOperation

from rest_framework.exceptions import NotFound, ValidationError

from apps.customers.models import CustomerProfile


def parse_date(value, field='date', default=None) -> date:
    if value in (None, ''):
        if default is not None:
            return default
        raise ValidationError({field: ['This field is required.']})
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValidationError({field: ['Use the YYYY-MM-DD format.']})


def parse_decimal(value, field, lo=None, hi=None, required=True) -> Decimal | None:
    if value in (None, ''):
        if required:
            raise ValidationError({field: ['This field is required.']})
        return None
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ValidationError({field: ['Enter a number.']})
    if (lo is not None and d < lo) or (hi is not None and d > hi):
        raise ValidationError({field: [f'Must be between {lo} and {hi}.']})
    return d


def parse_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'on')


def require(data, *fields):
    missing = {f: ['This field is required.'] for f in fields if not str(data.get(f, '') or '').strip()}
    if missing:
        raise ValidationError(missing)


def customer_of(request) -> CustomerProfile:
    profile, _ = CustomerProfile.objects.select_related('dairy', 'user', 'delivery_route').get_or_create(user=request.user)
    return profile


def dairy_of(request):
    dairy = getattr(request.user, 'dairy', None)
    if dairy is None:
        raise NotFound('No dairy is linked to this account.')
    return dairy


def partner_of(request):
    profile = getattr(request.user, 'delivery_profile', None)
    if profile is None or not profile.is_active:
        raise NotFound('No active delivery profile is linked to this account.')
    return profile


def media_url(request, field) -> str | None:
    if not field:
        return None
    return field.url
