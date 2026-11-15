from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def _domain_error_response(exc):
    """Service-layer errors (PortalError, WalletError, PlanError, DeliveryUpdateError) become 4xx responses."""
    if hasattr(exc, 'as_response_data'):
        data = exc.as_response_data()
        data.setdefault('detail', getattr(exc, 'message', str(exc)))
        return Response(data, status=getattr(exc, 'status', status.HTTP_400_BAD_REQUEST))
    if exc.__class__.__name__ == 'DeliveryUpdateError':
        return Response({'detail': exc.message, 'code': exc.code}, status=status.HTTP_400_BAD_REQUEST)
    return None


def custom_exception_handler(exc, context):
    """Unified API error response wrapper for enterprise consistency."""
    response = exception_handler(exc, context) or _domain_error_response(exc)

    if response is not None:
        customized_response = {
            'success': False,
            'status_code': response.status_code,
            'errors': response.data if isinstance(response.data, (dict, list)) else {'detail': str(response.data)},
        }
        if isinstance(response.data, dict) and 'detail' in response.data:
            customized_response['message'] = response.data['detail']
        else:
            customized_response['message'] = 'Validation or processing error occurred.'

        response.data = customized_response
    return response
