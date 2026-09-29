import { formatCurrency, formatQuantity, formatLitres } from '../src/shared/utils/formatters';
import { isCutoffPassed } from '../src/shared/utils/cutoff';
import authReducer, { quickDemoLogin, logout } from '../src/app/store/authSlice';
import subscriptionReducer, { setDayOverride, resetDayOverride } from '../src/app/store/subscriptionSlice';
import deliveryReducer, { updateDeliveryStatus } from '../src/app/store/deliverySlice';
import billingReducer, { paymentSuccess } from '../src/app/store/billingSlice';

describe('Gawali Mobile Utilities & Redux Test Suite', () => {
  describe('Formatters', () => {
    it('correctly formats INR currency', () => {
      expect(formatCurrency(2958)).toBe('₹2,958.00');
      expect(formatCurrency('100.5')).toBe('₹100.50');
      expect(formatCurrency(0)).toBe('₹0.00');
    });

    it('correctly formats milk quantities in litres', () => {
      expect(formatQuantity(1.5, 'L')).toBe('1.5 L');
      expect(formatLitres(2.0)).toBe('2 L');
      expect(formatLitres(0)).toBe('0 L');
    });
  });

  describe('Cutoff Logic', () => {
    it('evaluates future delivery dates properly', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);
      expect(isCutoffPassed(futureDate, '22:00:00')).toBe(false);
    });

    it('locks past dates immediately', () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);
      expect(isCutoffPassed(pastDate, '22:00:00')).toBe(true);
    });
  });

  describe('Auth Reducer', () => {
    it('handles 1-tap demo logins for Customer and Dairy', () => {
      const state1 = authReducer(undefined, quickDemoLogin('customer'));
      expect(state1.isAuthenticated).toBe(true);
      expect(state1.user?.role).toBe('customer');
      expect(state1.user?.fullName).toBe('Rahul Patil');

      const state2 = authReducer(undefined, quickDemoLogin('dairy'));
      expect(state2.isAuthenticated).toBe(true);
      expect(state2.user?.role).toBe('dairy');
      expect(state2.user?.dairyName).toBe('Badhale Dairy');

      const state3 = authReducer(state2, logout());
      expect(state3.isAuthenticated).toBe(false);
      expect(state3.user).toBeNull();
    });
  });

  describe('Subscription Reducer', () => {
    it('sets and removes day override (e.g. skip or double)', () => {
      const state1 = subscriptionReducer(
        undefined,
        setDayOverride({ date: '2026-10-01', quantity: 0 })
      );
      expect(state1.overrides['2026-10-01']).toBeDefined();
      expect(state1.overrides['2026-10-01'].status).toBe('skipped');
      expect(state1.overrides['2026-10-01'].quantity).toBe(0);

      const state2 = subscriptionReducer(state1, resetDayOverride('2026-10-01'));
      expect(state2.overrides['2026-10-01']).toBeUndefined();
    });
  });

  describe('Delivery Reducer', () => {
    it('updates customer route delivery status to delivered', () => {
      const state = deliveryReducer(
        undefined,
        updateDeliveryStatus({ customerId: 3, status: 'delivered' })
      );
      const cust = state.routeCustomers.find((c) => c.id === 3);
      expect(cust?.status).toBe('delivered');
      expect(cust?.deliveredAt).toBeDefined();
    });
  });

  describe('Billing Reducer', () => {
    it('marks bill as paid upon successful payment transaction', () => {
      const state = billingReducer(undefined, paymentSuccess(201));
      const bill = state.bills.find((b) => b.id === 201);
      expect(bill?.status).toBe('paid');
      expect(bill?.paidAt).toBeDefined();
    });
  });
});
