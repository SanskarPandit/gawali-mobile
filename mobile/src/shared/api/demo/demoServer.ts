/**
 * In-app stand-in for the Gawali API, used only in demo mode.
 *
 * It answers the same URLs with the same response shapes as the backend so every
 * screen runs one code path. State lives in memory for the demo session and is
 * thrown away when the demo ends. Business rules mirror the backend closely
 * enough to feel real (cutoff, one plan per customer, vacations, sync).
 */
import type { ApiArgs, ApiError } from '../baseQuery';
import type {
  Bill,
  CalendarDay,
  CustomerProfile,
  DairyCustomer,
  DairyProfile,
  Delivery,
  DeliveryStatus,
  Gawali,
  Order,
  PlanStatus,
  Product,
  Route,
  TimeSlot,
  Vacation,
} from '../types';
import { toNumber } from '../types';

type Result = { data: unknown } | { error: ApiError };

// --- Dates (local calendar days, never UTC) -------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: string, n: number) => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return isoDate(d);
};
const today = () => isoDate(new Date());
const fmt2 = (n: number) => n.toFixed(2);
const uid = (() => {
  let n = 1000;
  return (prefix: string) => `${prefix}-${++n}`;
})();

const CUTOFF = '22:00:00';
const earliestChangeable = () => {
  const now = new Date();
  const [h, m] = CUTOFF.split(':').map(Number);
  const pastCutoff = now.getHours() > h || (now.getHours() === h && now.getMinutes() > m);
  return addDays(today(), pastCutoff ? 2 : 1);
};

// --- Seed data -------------------------------------------------------------------

interface Plan {
  id: string;
  productId: string;
  quantity: number;
  status: PlanStatus;
  slot: TimeSlot;
  startDate: string;
}

interface DemoCustomer {
  profile: CustomerProfile;
  plan: Plan | null;
}

interface DemoState {
  dairy: DairyProfile;
  routes: Route[];
  gawalis: Gawali[];
  products: Product[];
  customers: DemoCustomer[];
  meId: string;
  overrides: Map<string, { id: string; quantity: number }>; // key `${customerId}|${date}`
  vacations: (Vacation & { customerId: string })[];
  deliveries: Delivery[];
  orders: Order[];
  bills: Bill[];
}

const created = '2026-07-15T08:00:00+05:30';

function seed(): DemoState {
  const dairyId = 'demo-dairy';
  const routes: Route[] = [
    { id: 'demo-route-baner', dairy: dairyId, name: 'Baner Morning', description: 'Green Acres, Symphony Heights, Lake View', sort_order: 1, created_at: created },
    { id: 'demo-route-aundh', dairy: dairyId, name: 'Aundh Loop', description: 'ITI Road and Parihar Chowk', sort_order: 2, created_at: created },
  ];
  const product = (id: string, name: string, unit: string, price: number, kind: Product['kind']): Product => ({
    id, dairy: dairyId, name, unit, price_per_unit: fmt2(price), kind, is_available: true, description: '', image_url: null, created_at: created,
  });
  const products = [
    product('demo-p-cow', 'A2 Cow Milk', 'L', 70, 'subscription'),
    product('demo-p-buffalo', 'Buffalo Milk', 'L', 80, 'subscription'),
    product('demo-p-curd', 'Fresh Curd', '500g', 45, 'one_time'),
    product('demo-p-paneer', 'Malai Paneer', '200g', 95, 'one_time'),
    product('demo-p-ghee', 'Desi Cow Ghee', '500ml', 450, 'one_time'),
  ];

  const mk = (
    id: string, name: string, phone: string, email: string, flat: string, address: string, routeId: string | null, stop: number,
    plan: Omit<Plan, 'id' | 'slot' | 'startDate'> | null,
  ): DemoCustomer => ({
    profile: {
      id, full_name: name, phone, email, dairy: dairyId, dairy_name: 'Badhale Dairy', delivery_route: routeId,
      route_name: routes.find((r) => r.id === routeId)?.name ?? null, address, flat_or_house_number: flat, landmark: '',
      latitude: '18.5596580', longitude: '73.7794340', delivery_instructions: id === 'demo-customer-profile' ? 'Ring bell once, leave bag on the door handle' : '',
      preferred_language: 'mr', dark_mode_enabled: false, route_stop_order: stop, is_active: true, needs_onboarding: false, created_at: created,
    },
    plan: plan ? { ...plan, id: `plan-${id}`, slot: 'morning', startDate: '2026-08-01' } : null,
  });

  const customers = [
    mk('demo-customer-profile', 'Rahul Patil', '+919876543212', 'rahul.patil@example.com', 'Flat 402', 'Green Acres, Baner, Pune 411045', 'demo-route-baner', 1, { productId: 'demo-p-cow', quantity: 1.5, status: 'active' }),
    mk('demo-c-anjali', 'Anjali Sharma', '+919876543215', 'anjali.sharma@example.com', 'Flat 201', 'Green Acres, Baner, Pune', 'demo-route-baner', 2, { productId: 'demo-p-cow', quantity: 2, status: 'active' }),
    mk('demo-c-vikram', 'Vikram Joshi', '+919876543216', 'vikram.joshi@example.com', 'Flat 503', 'Symphony Heights, Baner', 'demo-route-baner', 3, { productId: 'demo-p-buffalo', quantity: 1, status: 'active' }),
    mk('demo-c-priya', 'Priya Kulkarni', '+919876543217', 'priya.k@example.com', 'B-12', 'Lake View, Aundh', 'demo-route-aundh', 1, { productId: 'demo-p-cow', quantity: 1, status: 'active' }),
    mk('demo-c-sameer', 'Sameer Deshmukh', '+919876543218', 'sameer.d@example.com', 'Bungalow 7', 'ITI Road, Aundh', 'demo-route-aundh', 2, { productId: 'demo-p-buffalo', quantity: 2, status: 'paused' }),
  ];

  const gawalis: Gawali[] = [
    { id: 'demo-gawali-profile', full_name: 'Suresh Kadam', phone: '+919876543213', email: 'suresh.kadam@gawali.app', account_active: true, dairy: dairyId, vehicle_number: 'MH12 AB 4521', assigned_route: null, route_name: null, is_active: true, created_at: created },
    { id: 'demo-gawali-2', full_name: 'Ganesh Pawar', phone: '+919876543219', email: 'ganesh.pawar@gawali.app', account_active: true, dairy: dairyId, vehicle_number: '', assigned_route: 'demo-route-aundh', route_name: 'Aundh Loop', is_active: true, created_at: created },
  ];

  const dairy: DairyProfile = {
    id: dairyId, user: 'demo-dairy-owner', owner_name: 'Shailesh Badhale', owner_email: 'shailesh.badhale@gawali.app',
    business_name: 'Badhale Dairy', phone: '+919876543211', address: 'Survey 42, Baner Road', city: 'Pune', state: 'Maharashtra',
    pincode: '411045', cutoff_time: CUTOFF, billing_cycle: 'monthly', is_verified: true, is_active: true, bank_upi_id: 'badhaledairy@upi',
    routes, created_at: created,
  };

  const lastMonth = parseDate(today());
  lastMonth.setDate(1);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const billMonth = isoDate(lastMonth);
  const monthName = lastMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const bills: Bill[] = customers
    .filter((c) => c.plan)
    .map((c, i) => {
      const price = toNumber(products.find((p) => p.id === c.plan!.productId)!.price_per_unit);
      const qty = c.plan!.quantity * 28;
      const total = qty * price;
      const paid = i % 2 === 0 ? 0 : total;
      return {
        id: `demo-bill-${c.profile.id}`, customer: c.profile.id, customer_name: c.profile.full_name, dairy: dairyId,
        dairy_name: 'Badhale Dairy', billing_month: billMonth, month_name: monthName, total_quantity: fmt2(qty),
        total_amount: fmt2(total), paid_amount: fmt2(paid), due_amount: fmt2(total - paid), status: paid ? 'paid' : 'generated',
        due_date: addDays(billMonth, 40), paid_at: paid ? created : null, pdf_url: null, is_paid: !!paid,
        items: [{ id: uid('bi'), date: billMonth, item_name: `${products.find((p) => p.id === c.plan!.productId)!.name} (28 days)`, quantity: fmt2(qty), unit_price: fmt2(price), total_amount: fmt2(total) }],
        created_at: created,
      };
    });

  const state: DemoState = {
    dairy, routes, gawalis, products, customers, meId: 'demo-customer-profile',
    overrides: new Map(), vacations: [], deliveries: [], orders: [], bills,
  };
  state.orders.push({
    id: uid('order'), customer: state.meId, customer_name: 'Rahul Patil', customer_address: 'Green Acres, Baner', dairy: dairyId,
    product: 'demo-p-curd', product_name: 'Fresh Curd', product_unit: '500g', quantity: '1.00', unit_price: '45.00', total_price: '45.00',
    delivery_date: addDays(today(), 2), status: 'pending', created_at: created,
  });
  generateManifest(state, today());
  // A realistic morning: the first two stops are already done.
  state.deliveries.slice(0, 2).forEach((d) => {
    d.status = 'delivered';
    d.delivered_quantity = d.scheduled_quantity;
    d.delivered_at = new Date().toISOString();
  });
  return state;
}

let state: DemoState | null = null;
const db = () => (state ??= seed());

/** Throw away all demo data; the next demo starts fresh. */
export const resetDemoServer = () => {
  state = null;
};

// --- Domain helpers ----------------------------------------------------------------

const customerById = (s: DemoState, id: string) => s.customers.find((c) => c.profile.id === id);
const productById = (s: DemoState, id: string) => s.products.find((p) => p.id === id);
const onVacation = (s: DemoState, customerId: string, date: string) =>
  s.vacations.some((v) => v.customerId === customerId && v.is_active && v.start_date <= date && date <= v.end_date);

function scheduledFor(s: DemoState, c: DemoCustomer, date: string): number {
  if (!c.plan || c.plan.status !== 'active' || c.plan.startDate > date) return 0;
  if (onVacation(s, c.profile.id, date)) return 0;
  const o = s.overrides.get(`${c.profile.id}|${date}`);
  return o ? o.quantity : c.plan.quantity;
}

function generateManifest(s: DemoState, date: string) {
  for (const c of s.customers) {
    if (!c.plan || c.plan.startDate > date) continue;
    const qty = scheduledFor(s, c, date);
    const existing = s.deliveries.find((d) => d.customer_id === c.profile.id && d.delivery_date === date);
    if (existing) {
      if (!existing.status_updated_at && (existing.status === 'pending' || existing.status === 'skipped') && date >= earliestChangeable()) {
        existing.scheduled_quantity = fmt2(qty);
        existing.status = qty === 0 ? 'skipped' : 'pending';
      }
      continue;
    }
    if (c.plan.status !== 'active') continue;
    const p = productById(s, c.plan.productId)!;
    s.deliveries.push({
      id: uid('delivery'), delivery_date: date, scheduled_quantity: fmt2(qty), delivered_quantity: '0.00',
      status: qty === 0 ? 'skipped' : 'pending', delivered_at: null, status_updated_at: null, notes: '',
      customer_id: c.profile.id, customer_name: c.profile.full_name, customer_phone: c.profile.phone,
      customer_address: c.profile.address, flat_or_house: c.profile.flat_or_house_number, landmark: c.profile.landmark,
      delivery_instructions: c.profile.delivery_instructions, latitude: c.profile.latitude, longitude: c.profile.longitude,
      route_id: c.profile.delivery_route, route_name: c.profile.route_name, product_name: p.name, product_unit: p.unit,
      stop_order: c.profile.route_stop_order,
    });
  }
}

const sortStops = (a: Delivery, b: Delivery) =>
  (a.route_name ?? '~').localeCompare(b.route_name ?? '~') || a.stop_order - b.stop_order || a.customer_name.localeCompare(b.customer_name);

function outstanding(s: DemoState, customerId: string) {
  return s.bills.filter((b) => b.customer === customerId).reduce((sum, b) => sum + toNumber(b.due_amount), 0);
}

function dairyCustomer(s: DemoState, c: DemoCustomer): DairyCustomer {
  const p = c.plan ? productById(s, c.plan.productId)! : null;
  return {
    ...c.profile,
    plan: c.plan && c.plan.status !== 'cancelled' && p
      ? { subscription_id: c.plan.id, product_name: p.name, unit: p.unit, default_quantity: fmt2(c.plan.quantity), status: c.plan.status }
      : null,
    outstanding: fmt2(outstanding(s, c.profile.id)),
  };
}

function planSummary(s: DemoState, c: DemoCustomer) {
  if (!c.plan || c.plan.status === 'cancelled') return null;
  const p = productById(s, c.plan.productId)!;
  return {
    id: c.plan.id, product_id: p.id, product_name: p.name, default_quantity: fmt2(c.plan.quantity), unit: p.unit,
    price_per_unit: p.price_per_unit, status: c.plan.status, delivery_time_slot: c.plan.slot, start_date: c.plan.startDate,
  };
}

function subscriptionOf(s: DemoState, c: DemoCustomer) {
  if (!c.plan) return null;
  return {
    id: c.plan.id, customer: c.profile.id, product: productById(s, c.plan.productId)!, default_quantity: fmt2(c.plan.quantity),
    delivery_time_slot: c.plan.slot, status: c.plan.status, start_date: c.plan.startDate, end_date: null, created_at: created,
  };
}

function applyPlanChange(s: DemoState, c: DemoCustomer, body: any): Result | null {
  if (body.product_id) {
    const p = productById(s, body.product_id);
    if (!p || p.kind !== 'subscription' || !p.is_available) return bad({ product_id: 'Choose a daily product from this dairy.' });
  }
  if (!c.plan) {
    if (!body.product_id || !body.default_quantity) return bad({}, 'A product and quantity are required to start a plan.');
    c.plan = { id: uid('plan'), productId: body.product_id, quantity: toNumber(body.default_quantity), status: 'active', slot: body.delivery_time_slot ?? 'morning', startDate: earliestChangeable() };
  } else {
    if (body.product_id) c.plan.productId = body.product_id;
    if (body.default_quantity !== undefined) c.plan.quantity = toNumber(body.default_quantity);
    if (body.delivery_time_slot) c.plan.slot = body.delivery_time_slot;
    if (body.status) c.plan.status = body.status;
  }
  for (const d of s.deliveries) {
    if (d.customer_id === c.profile.id && d.delivery_date >= earliestChangeable() && !d.status_updated_at) {
      const qty = scheduledFor(s, c, d.delivery_date);
      d.scheduled_quantity = fmt2(qty);
      d.status = qty === 0 ? 'skipped' : 'pending';
    }
  }
  return null;
}

// --- Responses -------------------------------------------------------------------------

const ok = (data: unknown): Result => ({ data });
const bad = (fieldErrors: Record<string, string>, message?: string, status = 400): Result => ({
  error: { status, message: message ?? Object.values(fieldErrors)[0] ?? 'Please check the details.', fieldErrors },
});
const notFound = (what = 'Not found.') => bad({}, what, 404);
const page = <T,>(results: T[]) => ({ count: results.length, total_pages: 1, current_page: 1, next: null, previous: null, results });

// --- Router ---------------------------------------------------------------------------------

type Handler = (m: RegExpMatchArray, body: any, params: Record<string, any>, s: DemoState) => Result;
const routes: [string, RegExp, Handler][] = [];
const on = (method: string, pattern: string, handler: Handler) =>
  routes.push([method, new RegExp(`^${pattern.replace(/:id/g, '([^/]+)')}/?$`), handler]);

// Onboarding
on('GET', '/dairies/public-list', (_m, _b, _p, s) => ok(page([{ id: s.dairy.id, business_name: s.dairy.business_name, phone: s.dairy.phone, city: s.dairy.city, cutoff_time: s.dairy.cutoff_time }])));
on('GET', '/products/dairy/:id', (_m, _b, _p, s) => ok(s.products.filter((p) => p.is_available)));

// Customer
const me = (s: DemoState) => customerById(s, s.meId)!;
on('GET', '/customers/profile', (_m, _b, _p, s) => ok(me(s).profile));
on('PATCH', '/customers/profile', (_m, body, _p, s) => {
  const allowed = ['address', 'flat_or_house_number', 'landmark', 'delivery_instructions', 'preferred_language', 'dark_mode_enabled'];
  if ('address' in body && !String(body.address).trim()) return bad({ address: 'Address cannot be empty.' });
  for (const k of allowed) if (k in body) (me(s).profile as any)[k] = body[k];
  return ok(me(s).profile);
});
on('POST', '/customers/setup', (_m, body, _p, s) => {
  const c = me(s);
  c.profile.address = body.address;
  c.profile.delivery_instructions = body.delivery_instructions ?? '';
  const err = applyPlanChange(s, c, { ...body, status: 'active' });
  return err ?? ok({ success: true, message: `Your deliveries start on ${c.plan!.startDate}.`, profile: c.profile });
});
on('GET', '/customers/dashboard', (_m, _b, _p, s) => {
  generateManifest(s, today());
  const c = me(s);
  const monthStart = today().slice(0, 8) + '01';
  const delivered = s.deliveries.filter((d) => d.customer_id === c.profile.id && d.status === 'delivered' && d.delivery_date >= monthStart);
  const price = c.plan ? toNumber(productById(s, c.plan.productId)!.price_per_unit) : 0;
  const qty = delivered.reduce((sum, d) => sum + toNumber(d.delivered_quantity), 0);
  const todayRow = s.deliveries.find((d) => d.customer_id === c.profile.id && d.delivery_date === today());
  const unpaid = s.bills.find((b) => b.customer === c.profile.id && toNumber(b.due_amount) > 0);
  return ok({
    customer_name: c.profile.full_name,
    today: today(),
    needs_onboarding: false,
    dairy: { id: s.dairy.id, name: s.dairy.business_name, phone: s.dairy.phone, cutoff_time: s.dairy.cutoff_time, upi_id: s.dairy.bank_upi_id },
    earliest_changeable_date: earliestChangeable(),
    subscription: planSummary(s, c),
    today_delivery: todayRow ? { id: todayRow.id, status: todayRow.status, scheduled_quantity: todayRow.scheduled_quantity, delivered_quantity: todayRow.delivered_quantity, delivered_at: todayRow.delivered_at } : null,
    this_month_so_far: { delivered_quantity: fmt2(qty), delivered_days: delivered.length, estimated_amount: fmt2(qty * price) },
    upcoming_orders: s.orders.filter((o) => o.customer === c.profile.id && o.status === 'pending' && o.delivery_date >= today()).length,
    unpaid_bill: unpaid ? { bill_id: unpaid.id, month: unpaid.month_name, due_amount: unpaid.due_amount, due_date: unpaid.due_date } : null,
  });
});
on('GET', '/subscriptions/plan', (_m, _b, _p, s) => ok({ subscription: subscriptionOf(s, me(s)) }));
on('PATCH', '/subscriptions/plan', (_m, body, _p, s) => {
  if (body.status === 'cancelled') return bad({ status: 'Contact your dairy to cancel the plan.' });
  const err = applyPlanChange(s, me(s), body);
  return err ?? ok({ success: true, message: `Your plan changes apply from ${earliestChangeable()}.`, subscription: subscriptionOf(s, me(s)) });
});
on('GET', '/subscriptions/calendar', (_m, _b, params, s) => {
  const c = me(s);
  const year = Number(params.year);
  const month = Number(params.month);
  const daysIn = new Date(year, month, 0).getDate();
  const earliest = earliestChangeable();
  const days: CalendarDay[] = [];
  for (let day = 1; day <= daysIn; day++) {
    const date = isoDate(new Date(year, month - 1, day));
    const o = s.overrides.get(`${c.profile.id}|${date}`);
    const vac = onVacation(s, c.profile.id, date);
    const scheduled = scheduledFor(s, c, date);
    const row = s.deliveries.find((d) => d.customer_id === c.profile.id && d.delivery_date === date);
    let status: CalendarDay['status'];
    let actual: number = scheduled;
    if (row) {
      status = row.status;
      actual = toNumber(row.delivered_quantity);
    } else if (date < today()) {
      // Demo history: a plausible delivered past.
      status = c.plan && c.plan.startDate <= date ? 'delivered' : 'none';
      actual = status === 'delivered' ? c.plan!.quantity : 0;
    } else if (vac) {
      status = 'vacation';
      actual = 0;
    } else {
      status = scheduled === 0 ? (o ? 'skipped' : 'none') : 'scheduled';
    }
    days.push({
      date, day, weekday: new Date(year, month - 1, day).toLocaleDateString('en-US', { weekday: 'short' }),
      scheduled_quantity: date < today() && !row && status === 'delivered' ? c.plan!.quantity : scheduled,
      actual_quantity: actual, status, override_id: o?.id ?? null,
      override_type: o ? (o.quantity === 0 ? 'skip' : c.plan && o.quantity === c.plan.quantity * 2 ? 'double' : 'custom') : null,
      is_vacation: vac, can_modify: !!c.plan && date >= earliest && !vac, is_today: date === today(), is_past: date < today(),
      extras: s.orders.filter((x) => x.customer === c.profile.id && x.delivery_date === date && x.status !== 'cancelled')
        .map((x) => ({ id: x.id, product_name: x.product_name, quantity: x.quantity, status: x.status })),
    });
  }
  return ok({
    year, month, has_subscription: !!c.plan, default_quantity: c.plan ? fmt2(c.plan.quantity) : 0,
    unit: c.plan ? productById(s, c.plan.productId)!.unit : 'L', cutoff_time: CUTOFF, earliest_changeable_date: earliest, days,
    vacations: s.vacations.filter((v) => v.customerId === c.profile.id && v.is_active),
  });
});
on('POST', '/subscriptions/override', (_m, body, _p, s) => {
  const c = me(s);
  if (!c.plan || c.plan.status !== 'active') return bad({}, 'You need an active plan to change a day.');
  if (body.date < earliestChangeable()) return bad({}, `Changes for tomorrow closed at 10:00 PM. The earliest date you can change is ${earliestChangeable()}.`);
  const qty = toNumber(body.quantity);
  if (qty < 0 || qty > 20) return bad({ quantity: 'Quantity must be between 0 and 20.' });
  const key = `${c.profile.id}|${body.date}`;
  if (qty === c.plan.quantity) s.overrides.delete(key);
  else s.overrides.set(key, { id: s.overrides.get(key)?.id ?? uid('override'), quantity: qty });
  applyPlanChange(s, c, {});
  return ok({ success: true, message: qty === 0 ? `${body.date}: skipped` : `${body.date}: ${qty}` });
});
on('DELETE', '/subscriptions/override/:id', (m, _b, _p, s) => {
  for (const [key, value] of s.overrides) {
    if (value.id === m[1]) {
      if (key.split('|')[1] < earliestChangeable()) return bad({}, 'This day can no longer be changed.');
      s.overrides.delete(key);
      applyPlanChange(s, me(s), {});
      return ok({ success: true, message: 'Back to your normal quantity.' });
    }
  }
  return notFound('Change not found.');
});
on('GET', '/subscriptions/vacations', (_m, _b, _p, s) => ok(s.vacations.filter((v) => v.customerId === s.meId && v.is_active)));
on('POST', '/subscriptions/vacations', (_m, body, _p, s) => {
  if (!body.start_date || !body.end_date) return bad({}, 'Start and end dates are required.');
  if (body.start_date > body.end_date) return bad({ end_date: 'End date must be on or after the start date.' });
  if (body.start_date < earliestChangeable()) return bad({ start_date: `The earliest you can pause is ${earliestChangeable()}.` });
  const v = { id: uid('vacation'), customerId: s.meId, start_date: body.start_date, end_date: body.end_date, reason: body.reason ?? '', is_active: true, created_at: new Date().toISOString() };
  s.vacations.push(v);
  applyPlanChange(s, me(s), {});
  return ok(v);
});
on('DELETE', '/subscriptions/vacations/:id', (m, _b, _p, s) => {
  const v = s.vacations.find((x) => x.id === m[1]);
  if (!v) return notFound();
  v.is_active = false;
  applyPlanChange(s, me(s), {});
  return ok({ success: true, message: 'Vacation cancelled.' });
});
on('GET', '/products/shop', (_m, _b, _p, s) => ok(s.products.filter((p) => p.is_available)));
on('GET', '/subscriptions/orders', (_m, _b, params, s) => {
  let rows = s.orders;
  if (params.upcoming === 'true') rows = rows.filter((o) => o.delivery_date >= today());
  if (params.status) rows = rows.filter((o) => o.status === params.status);
  if (params.date) rows = rows.filter((o) => o.delivery_date === params.date);
  return ok(page([...rows].sort((a, b) => b.delivery_date.localeCompare(a.delivery_date))));
});
on('POST', '/subscriptions/orders', (_m, body, _p, s) => {
  const p = productById(s, body.product);
  if (!p || p.kind !== 'one_time') return bad({ product: 'This item is not available from your dairy.' });
  if (body.delivery_date < earliestChangeable()) return bad({ delivery_date: `Pick a date from ${earliestChangeable()}.` });
  const qty = toNumber(body.quantity);
  const order: Order = {
    id: uid('order'), customer: s.meId, customer_name: me(s).profile.full_name, customer_address: me(s).profile.address, dairy: s.dairy.id,
    product: p.id, product_name: p.name, product_unit: p.unit, quantity: fmt2(qty), unit_price: p.price_per_unit,
    total_price: fmt2(qty * toNumber(p.price_per_unit)), delivery_date: body.delivery_date, status: 'pending', created_at: new Date().toISOString(),
  };
  s.orders.push(order);
  return ok(order);
});
on('POST', '/subscriptions/orders/:id/cancel', (m, _b, _p, s) => {
  const o = s.orders.find((x) => x.id === m[1]);
  if (!o) return notFound();
  if (o.status !== 'pending' || o.delivery_date < earliestChangeable()) return bad({}, 'This order can no longer be cancelled.');
  o.status = 'cancelled';
  return ok(o);
});
on('POST', '/subscriptions/orders/:id/set-status', (m, body, _p, s) => {
  const o = s.orders.find((x) => x.id === m[1]);
  if (!o) return notFound();
  o.status = body.status;
  return ok(o);
});
on('GET', '/billing/my-bills', (_m, _b, _p, s) => {
  const mine = s.bills.filter((b) => b.customer === s.meId);
  const sum = (k: keyof Bill) => mine.reduce((t, b) => t + toNumber(b[k] as string), 0);
  return ok({ summary: { total_billed: sum('total_amount'), total_paid: sum('paid_amount'), total_due: sum('due_amount') }, bills: mine });
});
on('GET', '/billing/my-bills/:id', (m, _b, _p, s) => {
  const b = s.bills.find((x) => x.id === m[1] && x.customer === s.meId);
  return b ? ok(b) : notFound('Bill not found.');
});

// Dairy: business
on('GET', '/dairies/dashboard', (_m, _b, _p, s) => {
  generateManifest(s, today());
  const rows = s.deliveries.filter((d) => d.delivery_date === today());
  const overdue = s.bills.filter((b) => toNumber(b.due_amount) > 0).map((b) => {
    const c = customerById(s, b.customer)!;
    return {
      bill_id: b.id, customer_id: c.profile.id, customer_name: c.profile.full_name, phone: c.profile.phone ?? '', address: c.profile.address,
      due_amount: toNumber(b.due_amount), billing_month: b.month_name,
      whatsapp_url: `https://wa.me/${(c.profile.phone ?? '').replace(/\D/g, '')}`, call_phone: c.profile.phone ?? '',
    };
  });
  return ok({
    business_name: s.dairy.business_name, today: today(),
    today_volume_litres: rows.reduce((t, d) => t + toNumber(d.scheduled_quantity), 0),
    today_delivered_count: rows.filter((d) => d.status === 'delivered').length, today_total_deliveries: rows.length,
    total_active_customers: s.customers.filter((c) => c.plan?.status === 'active').length,
    this_month_earned: 18450, total_outstanding_dues: overdue.reduce((t, o) => t + o.due_amount, 0),
    cutoff_time: s.dairy.cutoff_time, overdue_customers: overdue,
  });
});
on('GET', '/dairies/profile', (_m, _b, _p, s) => ok({ ...s.dairy, routes: s.routes }));
on('PATCH', '/dairies/profile', (_m, body, _p, s) => {
  if ('business_name' in body && !String(body.business_name).trim()) return bad({ business_name: 'Enter the dairy name.' });
  if (body.bank_upi_id && !/^[\w.-]{2,256}@[a-zA-Z]{2,64}$/.test(body.bank_upi_id)) return bad({ bank_upi_id: 'Enter a valid UPI ID, e.g. dairyname@upi.' });
  const editable = ['business_name', 'phone', 'address', 'city', 'state', 'pincode', 'cutoff_time', 'billing_cycle', 'bank_upi_id'];
  for (const k of editable) if (k in body) (s.dairy as any)[k] = body[k];
  return ok({ ...s.dairy, routes: s.routes });
});
on('GET', '/reports/vendor', (_m, _b, params, s) => {
  const scale = params.preset === 'last_7d' ? 0.25 : 1;
  const by_product = s.products.filter((p) => p.kind === 'subscription').map((p, i) => ({ name: p.name, unit: p.unit, quantity: (i ? 60 : 140) * scale, amount: (i ? 4800 : 9800) * scale }));
  const days = params.preset === 'last_7d' ? 7 : 30;
  return ok({
    from: addDays(today(), -days + 1), to: today(),
    summary: { delivered_litres: 200 * scale, revenue_earned: 14600 * scale, total_billed: 16800 * scale, total_collected: 12100 * scale },
    by_product,
    top_customers: s.customers.slice(0, 4).map((c, i) => ({ customer_id: c.profile.id, name: c.profile.full_name, quantity: (60 - i * 10) * scale, amount: (4200 - i * 700) * scale })),
    daily_breakdown: Array.from({ length: Math.min(days, 14) }, (_, i) => ({ date: addDays(today(), -i), quantity: 6.5 + (i % 3), amount: 470 + (i % 3) * 70 })),
  });
});

// Dairy: routes & gawalis
on('GET', '/dairies/routes', (_m, _b, _p, s) => ok(s.routes));
on('POST', '/dairies/routes', (_m, body, _p, s) => {
  const name = String(body.name ?? '').trim();
  if (!name) return bad({ name: 'Enter a route name.' });
  if (s.routes.some((r) => r.name.toLowerCase() === name.toLowerCase())) return bad({ name: 'You already have a route with this name.' });
  const r: Route = { id: uid('route'), dairy: s.dairy.id, name, description: body.description ?? '', sort_order: s.routes.length + 1, created_at: new Date().toISOString() };
  s.routes.push(r);
  return ok(r);
});
on('PATCH', '/dairies/routes/:id', (m, body, _p, s) => {
  const r = s.routes.find((x) => x.id === m[1]);
  if (!r) return notFound();
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return bad({ name: 'Enter a route name.' });
    r.name = name;
    s.customers.forEach((c) => c.profile.delivery_route === r.id && (c.profile.route_name = name));
    s.gawalis.forEach((g) => g.assigned_route === r.id && (g.route_name = name));
  }
  if (body.description !== undefined) r.description = body.description;
  return ok(r);
});
on('DELETE', '/dairies/routes/:id', (m, _b, _p, s) => {
  s.routes = s.routes.filter((r) => r.id !== m[1]);
  s.customers.forEach((c) => {
    if (c.profile.delivery_route === m[1]) {
      c.profile.delivery_route = null;
      c.profile.route_name = null;
    }
  });
  s.gawalis.forEach((g) => {
    if (g.assigned_route === m[1]) {
      g.assigned_route = null;
      g.route_name = null;
    }
  });
  return ok(null);
});
on('GET', '/deliveries/delivery-boys', (_m, _b, _p, s) => ok(s.gawalis));
on('PATCH', '/deliveries/delivery-boys/:id', (m, body, _p, s) => {
  const g = s.gawalis.find((x) => x.id === m[1]);
  if (!g) return notFound();
  if ('assigned_route' in body) {
    const r = body.assigned_route ? s.routes.find((x) => x.id === body.assigned_route) : null;
    if (body.assigned_route && !r) return bad({ assigned_route: 'Route not found.' });
    g.assigned_route = r?.id ?? null;
    g.route_name = r?.name ?? null;
  }
  if ('vehicle_number' in body) g.vehicle_number = body.vehicle_number;
  return ok(g);
});

// Dairy: customers & plans
on('GET', '/customers/vendor/list', (_m, _b, params, s) => {
  let rows = s.customers.map((c) => dairyCustomer(s, c));
  if (params.search) {
    const q = String(params.search).toLowerCase();
    rows = rows.filter((c) => [c.full_name, c.phone ?? '', c.address, c.flat_or_house_number].some((v) => v.toLowerCase().includes(q)));
  }
  if (params.route_id === 'none') rows = rows.filter((c) => !c.delivery_route);
  else if (params.route_id) rows = rows.filter((c) => c.delivery_route === params.route_id);
  if (params.has_dues === 'true') rows = rows.filter((c) => toNumber(c.outstanding) > 0);
  return ok(page(rows.sort((a, b) => a.route_stop_order - b.route_stop_order || a.full_name.localeCompare(b.full_name))));
});
on('POST', '/customers/vendor/list', (_m, body, _p, s) => {
  const errors: Record<string, string> = {};
  if (!String(body.full_name ?? '').trim()) errors.full_name = 'Enter the customer name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email ?? '')) errors.email = 'Enter a valid email.';
  if (!String(body.address ?? '').trim()) errors.address = 'Enter the address.';
  if (Object.keys(errors).length) return bad(errors);
  if (s.customers.some((c) => c.profile.email === body.email.toLowerCase())) return bad({}, 'This customer is already on your list.', 409);
  const route = body.delivery_route ? s.routes.find((r) => r.id === body.delivery_route) : null;
  const c: DemoCustomer = {
    profile: {
      id: uid('customer'), full_name: body.full_name.trim(), phone: body.phone, email: body.email.toLowerCase(), dairy: s.dairy.id,
      dairy_name: s.dairy.business_name, delivery_route: route?.id ?? null, route_name: route?.name ?? null, address: body.address,
      flat_or_house_number: body.flat_or_house_number ?? '', landmark: body.landmark ?? '', latitude: null, longitude: null,
      delivery_instructions: body.delivery_instructions ?? '', preferred_language: 'en', dark_mode_enabled: false,
      route_stop_order: s.customers.filter((x) => x.profile.delivery_route === (route?.id ?? null)).length + 1,
      is_active: true, needs_onboarding: false, created_at: new Date().toISOString(),
    },
    plan: null,
  };
  const err = applyPlanChange(s, c, body);
  if (err) return err;
  s.customers.push(c);
  return ok({ ...dairyCustomer(s, c), temporary_password: `Gw${Math.random().toString(36).slice(2, 8)}42`, linked_existing_account: false });
});
on('POST', '/customers/vendor/reorder', (_m, body, _p, s) => {
  (body.customer_ids as string[]).forEach((id, i) => {
    const c = customerById(s, id);
    if (c) c.profile.route_stop_order = i + 1;
  });
  s.deliveries.forEach((d) => (d.stop_order = customerById(s, d.customer_id)?.profile.route_stop_order ?? d.stop_order));
  return ok({ success: true });
});
on('GET', '/customers/vendor/:id', (m, _b, _p, s) => {
  const c = customerById(s, m[1]);
  if (!c) return notFound('Customer not found.');
  const mine = s.deliveries.filter((d) => d.customer_id === c.profile.id);
  const bills = s.bills.filter((b) => b.customer === c.profile.id);
  const plan = planSummary(s, c);
  return ok({
    customer: dairyCustomer(s, c),
    metrics: {
      outstanding: fmt2(outstanding(s, c.profile.id)),
      this_month_delivered: fmt2((c.plan?.quantity ?? 0) * new Date().getDate()),
      this_month_amount: fmt2((c.plan?.quantity ?? 0) * new Date().getDate() * toNumber(plan?.price_per_unit ?? 0)),
      lifetime_delivered: fmt2((c.plan?.quantity ?? 0) * 75),
      lifetime_paid: fmt2(bills.reduce((t, b) => t + toNumber(b.paid_amount), 0)),
    },
    subscription: plan,
    recent_deliveries: mine.map((d) => ({ id: d.id, date: d.delivery_date, scheduled_quantity: d.scheduled_quantity, delivered_quantity: d.delivered_quantity, status: d.status })),
    bills: bills.map((b) => ({ id: b.id, month: b.month_name, billing_month: b.billing_month, total_amount: b.total_amount, paid_amount: b.paid_amount, due_amount: b.due_amount, status: b.status, is_paid: b.is_paid })),
  });
});
on('PATCH', '/customers/vendor/:id', (m, body, _p, s) => {
  const c = customerById(s, m[1]);
  if (!c) return notFound('Customer not found.');
  for (const k of ['address', 'flat_or_house_number', 'landmark', 'delivery_instructions', 'route_stop_order']) if (k in body) (c.profile as any)[k] = body[k];
  if ('delivery_route' in body) {
    const r = body.delivery_route ? s.routes.find((x) => x.id === body.delivery_route) : null;
    c.profile.delivery_route = r?.id ?? null;
    c.profile.route_name = r?.name ?? null;
    s.deliveries.forEach((d) => {
      if (d.customer_id === c.profile.id) {
        d.route_id = c.profile.delivery_route;
        d.route_name = c.profile.route_name;
      }
    });
  }
  return ok(dairyCustomer(s, c));
});
on('POST', '/subscriptions/vendor/customers/:id/plan', (m, body, _p, s) => {
  const c = customerById(s, m[1]);
  if (!c) return notFound('Customer not found.');
  if (c.plan && c.plan.status !== 'cancelled') return bad({}, 'This customer already has a plan. Change it instead.', 409);
  c.plan = null;
  return applyPlanChange(s, c, body) ?? ok(subscriptionOf(s, c));
});
on('PATCH', '/subscriptions/vendor/customers/:id/plan', (m, body, _p, s) => {
  const c = customerById(s, m[1]);
  if (!c?.plan) return notFound('This customer has no plan yet.');
  return applyPlanChange(s, c, body) ?? ok(subscriptionOf(s, c));
});
on('POST', '/billing/vendor/generate/:id', (m, _b, _p, s) => {
  const c = customerById(s, m[1]);
  if (!c) return notFound('Customer not found.');
  const bill = s.bills.find((b) => b.customer === c.profile.id);
  return ok({ success: true, message: 'Bill generated for this month', bill });
});
on('POST', '/billing/vendor/mark-paid/:id', (m, body, _p, s) => {
  const b = s.bills.find((x) => x.id === m[1]);
  if (!b) return notFound('Bill not found.');
  const due = toNumber(b.due_amount);
  const amount = body.mark_full || !body.amount ? due : Math.min(due, toNumber(body.amount));
  if (amount <= 0) return bad({}, 'Bill is already settled.');
  b.paid_amount = fmt2(toNumber(b.paid_amount) + amount);
  b.due_amount = fmt2(due - amount);
  b.is_paid = toNumber(b.due_amount) === 0;
  b.status = b.is_paid ? 'paid' : 'partially_paid';
  return ok({ success: true, message: `Recorded ₹${amount.toFixed(2)} payment`, bill: b });
});

// Dairy: deliveries & products
on('GET', '/deliveries/today', (_m, _b, params, s) => {
  const date = params.date ?? today();
  if (date >= today() && date <= addDays(today(), 1)) generateManifest(s, date);
  let rows = s.deliveries.filter((d) => d.delivery_date === date);
  if (params.route_id) rows = rows.filter((d) => d.route_id === params.route_id);
  rows = [...rows].sort(sortStops);
  const count = (st: DeliveryStatus) => rows.filter((d) => d.status === st).length;
  return ok({
    date,
    summary: {
      total: rows.length, delivered: count('delivered'), pending: count('pending'), skipped: count('skipped'), missed: count('missed'),
      scheduled_litres: rows.reduce((t, d) => t + toNumber(d.scheduled_quantity), 0),
      delivered_litres: rows.filter((d) => d.status === 'delivered').reduce((t, d) => t + toNumber(d.delivered_quantity), 0),
    },
    deliveries: rows,
  });
});
const applyDeliveryChange = (s: DemoState, change: any): Result => {
  const d = s.deliveries.find((x) => x.id === change.id);
  if (!d) return notFound('Delivery not found.');
  if (d.delivery_date > today()) return bad({}, 'Future deliveries cannot be marked yet.');
  const at = change.client_updated_at ?? new Date().toISOString();
  if (d.status_updated_at && at < d.status_updated_at) return ok({ superseded: true, delivery: d });
  if (change.status) {
    d.status = change.status;
    d.delivered_quantity = change.status === 'delivered' ? (change.delivered_quantity ?? d.scheduled_quantity) : '0.00';
    d.delivered_at = change.status === 'delivered' ? at : null;
  } else if (change.delivered_quantity != null) {
    d.delivered_quantity = fmt2(toNumber(change.delivered_quantity));
  }
  if (change.notes !== undefined) d.notes = change.notes;
  d.status_updated_at = at;
  return ok({ superseded: false, delivery: d });
};
on('PATCH', '/deliveries/:id/status', (m, body, _p, s) => {
  const r = applyDeliveryChange(s, { ...body, id: m[1] });
  if ('error' in r) return r;
  const { superseded, delivery } = r.data as any;
  return ok({ success: true, applied: !superseded, delivery });
});
on('POST', '/deliveries/sync', (_m, body, _p, s) => ok({
  results: (body.updates as any[]).map((u) => {
    const r = applyDeliveryChange(s, u);
    if ('error' in r) return { id: u.id, result: 'rejected', detail: r.error.message };
    const { superseded, delivery } = r.data as any;
    return { id: u.id, result: superseded ? 'superseded' : 'applied', delivery };
  }),
}));
on('GET', '/deliveries/boy/route', (_m, _b, _p, s) => {
  generateManifest(s, today());
  const g = s.gawalis[0];
  const stops = s.deliveries
    .filter((d) => d.delivery_date === today() && (!g.assigned_route || d.route_id === g.assigned_route))
    .sort(sortStops);
  return ok({
    date: today(), dairy_name: s.dairy.business_name, route_name: g.route_name,
    progress: { delivered: stops.filter((d) => d.status === 'delivered').length, pending: stops.filter((d) => d.status === 'pending').length, total: stops.length },
    stops,
  });
});
on('GET', '/products/vendor', (_m, _b, _p, s) => ok(s.products));
const validateProduct = (body: any): Record<string, string> => {
  const e: Record<string, string> = {};
  if ('name' in body && !String(body.name).trim()) e.name = 'Enter a product name.';
  if ('unit' in body && !String(body.unit).trim()) e.unit = 'Enter a unit, e.g. L or 500g.';
  if ('price_per_unit' in body && !(toNumber(body.price_per_unit) > 0)) e.price_per_unit = 'Enter a price above 0.';
  return e;
};
on('POST', '/products/vendor', (_m, body, _p, s) => {
  const e = validateProduct({ name: '', unit: '', price_per_unit: 0, ...body });
  if (Object.keys(e).length) return bad(e);
  const p: Product = { id: uid('product'), dairy: s.dairy.id, name: body.name.trim(), unit: body.unit.trim(), price_per_unit: fmt2(toNumber(body.price_per_unit)), kind: body.kind, is_available: body.is_available ?? true, description: body.description ?? '', image_url: null, created_at: new Date().toISOString() };
  s.products.push(p);
  return ok(p);
});
on('PATCH', '/products/vendor/:id', (m, body, _p, s) => {
  const p = productById(s, m[1]);
  if (!p) return notFound();
  const e = validateProduct(body);
  if (Object.keys(e).length) return bad(e);
  Object.assign(p, body, body.price_per_unit !== undefined ? { price_per_unit: fmt2(toNumber(body.price_per_unit)) } : {});
  return ok(p);
});
on('DELETE', '/products/vendor/:id', (m, _b, _p, s) => {
  s.products = s.products.filter((p) => p.id !== m[1]);
  return ok(null);
});

/** Entry point used by the base query in demo sessions. */
export async function handleDemoRequest(args: ApiArgs): Promise<Result> {
  const method = args.method ?? 'GET';
  const path = args.url.replace(/\/+$/, '');
  await new Promise<void>((r) => setTimeout(r, 180)); // feel like a network
  for (const [m, pattern, handler] of routes) {
    if (m !== method) continue;
    const match = path.match(pattern);
    if (match) {
      try {
        return handler(match, (args.body as any) ?? {}, (args.params as any) ?? {}, db());
      } catch {
        return { error: { status: 500, message: 'Something went wrong in demo mode.', fieldErrors: {} } };
      }
    }
  }
  return { error: { status: 404, message: 'This feature is not available in demo mode.', fieldErrors: {} } };
}
