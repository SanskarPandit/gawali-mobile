import { formatCurrency, formatQuantity, formatLitres } from '../src/shared/utils/formatters';
import { isCutoffPassed } from '../src/shared/utils/cutoff';
import authReducer, { startDemo, sessionEnded } from '../src/app/store/authSlice';

describe('Formatters', () => {
  it('formats INR currency', () => {
    expect(formatCurrency(2958)).toBe('₹2,958.00');
    expect(formatCurrency('100.5')).toBe('₹100.50');
    expect(formatCurrency(0)).toBe('₹0.00');
  });

  it('formats milk quantities', () => {
    expect(formatQuantity(1.5, 'L')).toBe('1.5 L');
    expect(formatQuantity('1.25', 'L')).toBe('1.25 L');
    expect(formatLitres(2.0)).toBe('2 L');
  });
});

describe('Cutoff', () => {
  it('keeps days beyond tomorrow open', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(isCutoffPassed(future, '22:00:00')).toBe(false);
  });

  it('locks past days', () => {
    const past = new Date();
    past.setDate(past.getDate() - 1);
    expect(isCutoffPassed(past, '22:00:00')).toBe(true);
  });
});

describe('Auth session', () => {
  it('starts a demo session as the chosen role and ends it cleanly', () => {
    const customer = authReducer(undefined, startDemo('customer'));
    expect(customer.isAuthenticated).toBe(true);
    expect(customer.user?.role).toBe('customer');
    expect(customer.sessionMode).toBe('demo');

    const dairy = authReducer(undefined, startDemo('dairy'));
    expect(dairy.user?.dairyName).toBe('Badhale Dairy');

    const ended = authReducer(dairy, sessionEnded());
    expect(ended.isAuthenticated).toBe(false);
    expect(ended.user).toBeNull();
    expect(ended.sessionMode).toBeNull();
  });
});
