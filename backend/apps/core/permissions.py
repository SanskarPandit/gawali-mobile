from rest_framework.permissions import BasePermission

class IsAdminUser(BasePermission):
    """Allows access only to platform admin users."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'admin' or request.user.is_superuser))

class IsDairyUser(BasePermission):
    """Allows access to dairy/vendor owners."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'dairy' or request.user.is_superuser))

class IsCustomerUser(BasePermission):
    """Allows access to customers."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'customer' or request.user.is_superuser))

class IsDeliveryBoyUser(BasePermission):
    """Allows access to delivery personnel."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role == 'delivery_boy' or request.user.is_superuser))

class IsDairyOrAdmin(BasePermission):
    """Allows access to either dairy vendors or platform admins."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role in ['dairy', 'admin'] or request.user.is_superuser))

class IsDeliveryOrDairyOrAdmin(BasePermission):
    """Allows access to delivery personnel, dairy owners, or admins."""
    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and (request.user.role in ['delivery_boy', 'dairy', 'admin'] or request.user.is_superuser))
