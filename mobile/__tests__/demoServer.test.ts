import { handleDemoRequest, resetDemoServer, isoDate } from '../src/shared/api/demo/demoServer';
import { extractFieldErrors } from '../src/shared/api/baseQuery';

const ok = async (args: Parameters<typeof handleDemoRequest>[0]) => {
  const res = await handleDemoRequest(args);
  if ('error' in res) throw new Error(res.error.message);
  return res.data as any;
};

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return { iso: isoDate(d), year: d.getFullYear(), month: d.getMonth() + 1 };
};

describe('Demo server', () => {
  beforeEach(() => resetDemoServer());

  it('serves the customer dashboard with a plan and dairy', async () => {
    const d = await ok({ url: '/customers/dashboard/' });
    expect(d.subscription.product_name).toBe('A2 Cow Milk');
    expect(d.dairy.name).toBe('Badhale Dairy');
  });

  it('shows a skipped future day on the calendar', async () => {
    const day = inDays(3);
    await ok({ url: '/subscriptions/override/', method: 'POST', body: { date: day.iso, quantity: '0' } });
    const cal = await ok({ url: '/subscriptions/calendar/', params: { year: day.year, month: day.month } });
    const entry = cal.days.find((x: any) => x.date === day.iso);
    expect(entry.status).toBe('skipped');
    expect(entry.override_id).toBeTruthy();
  });

  it('refuses changes to today', async () => {
    const res = await handleDemoRequest({
      url: '/subscriptions/override/',
      method: 'POST',
      body: { date: inDays(0).iso, quantity: '0' },
    });
    expect('error' in res).toBe(true);
  });

  it('applies offline sync and ignores older changes', async () => {
    const route = await ok({ url: '/deliveries/boy/route/' });
    const pending = route.stops.find((s: any) => s.status === 'pending');
    const newer = new Date().toISOString();
    const older = new Date(Date.now() - 60000).toISOString();

    const first = await ok({
      url: '/deliveries/sync/',
      method: 'POST',
      body: { updates: [{ id: pending.id, status: 'delivered', client_updated_at: newer }] },
    });
    expect(first.results[0].result).toBe('applied');
    const second = await ok({
      url: '/deliveries/sync/',
      method: 'POST',
      body: { updates: [{ id: pending.id, status: 'missed', client_updated_at: older }] },
    });
    expect(second.results[0].result).toBe('superseded');
  });

  it('validates new households and returns a temporary password', async () => {
    const bad = await handleDemoRequest({
      url: '/customers/vendor/list/',
      method: 'POST',
      body: { full_name: '', email: 'x', address: '' },
    });
    expect('error' in bad && bad.error.fieldErrors.email).toBeTruthy();

    const created = await ok({
      url: '/customers/vendor/list/',
      method: 'POST',
      body: {
        full_name: 'Asha Kale',
        email: 'asha@example.com',
        phone: '+919811000001',
        address: 'Lake View',
        product_id: 'demo-p-cow',
        default_quantity: '2',
      },
    });
    expect(created.temporary_password).toBeTruthy();
    expect(created.plan.default_quantity).toBe('2.00');
  });

  it('starts fresh after a reset', async () => {
    await ok({ url: '/dairies/routes/', method: 'POST', body: { name: 'Night Loop' } });
    resetDemoServer();
    const routes = await ok({ url: '/dairies/routes/' });
    expect(routes.map((r: any) => r.name)).not.toContain('Night Loop');
  });
});

describe('API error parsing', () => {
  it('reads field errors from both backend shapes', () => {
    expect(extractFieldErrors({ errors: { email: ['Taken'] }, message: 'x' })).toEqual({ email: 'Taken' });
    expect(extractFieldErrors({ product_id: ['Choose a product'] })).toEqual({ product_id: 'Choose a product' });
    expect(extractFieldErrors({ detail: 'Nope' })).toEqual({});
  });
});
