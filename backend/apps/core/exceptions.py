from rest_framework.views import exception_handler
from rest_framework.response import Response
from rest_framework import status

def custom_exception_handler(exc, context):
    """Unified API error response wrapper for enterprise consistency."""
    response = exception_handler(exc, context)

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
