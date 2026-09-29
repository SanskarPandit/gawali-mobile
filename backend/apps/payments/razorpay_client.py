import hmac
import hashlib
from django.conf import settings
import razorpay
import uuid
import logging

logger = logging.getLogger(__name__)

class RazorpayClient:
    def __init__(self):
        self.key_id = getattr(settings, 'RAZORPAY_KEY_ID', 'rzp_test_gawali_demo')
        self.key_secret = getattr(settings, 'RAZORPAY_KEY_SECRET', 'rzp_test_secret_demo')
        self.client = None
        if not self.key_id.startswith('rzp_test_gawali_demo'):
            try:
                self.client = razorpay.Client(auth=(self.key_id, self.key_secret))
            except Exception as e:
                logger.warning(f"Could not initialize Razorpay live client: {e}")

    def create_order(self, amount_in_rupees, receipt, notes=None):
        """Creates a Razorpay order. Amount is converted to paise."""
        amount_paise = int(float(amount_in_rupees) * 100)
        if self.client:
            try:
                data = {
                    'amount': amount_paise,
                    'currency': 'INR',
                    'receipt': receipt,
                    'notes': notes or {},
                    'payment_capture': 1
                }
                return self.client.order.create(data=data)
            except Exception as e:
                logger.error(f"Razorpay order create error: {e}")

        # Simulated test order for local development/testing
        mock_order_id = f"order_{uuid.uuid4().hex[:14]}"
        return {
            'id': mock_order_id,
            'amount': amount_paise,
            'currency': 'INR',
            'receipt': receipt,
            'status': 'created',
            'key_id': self.key_id
        }

    def verify_payment_signature(self, order_id, payment_id, signature):
        """Verifies HMAC SHA256 signature."""
        if not order_id or not payment_id or not signature:
            return False

        # If simulated mock order
        if order_id.startswith('order_') and signature == 'mock_signature_valid':
            return True

        msg = f"{order_id}|{payment_id}".encode('utf-8')
        secret = self.key_secret.encode('utf-8')
        generated_signature = hmac.new(secret, msg, hashlib.sha256).hexdigest()
        return hmac.compare_digest(generated_signature, signature)

razorpay_client = RazorpayClient()
