import reducer, { withPendingChanges } from '../src/app/store/deliverySyncSlice';
import type { Delivery } from '../src/shared/api/types';

const stop = (id: string, overrides: Partial<Delivery> = {}): Delivery => ({
  id,
  delivery_date: '2026-10-03',
  scheduled_quantity: '1.50',
  delivered_quantity: '0.00',
  status: 'pending',
  delivered_at: null,
  status_updated_at: null,
  notes: '',
  customer_id: `c-${id}`,
  customer_name: `Customer ${id}`,
  customer_phone: null,
  customer_address: 'Baner',
  flat_or_house: '',
  landmark: '',
  delivery_instructions: '',
  latitude: null,
  longitude: null,
  route_id: null,
  route_name: null,
  product_name: 'Cow Milk',
  product_unit: 'L',
  stop_order: 1,
  ...overrides,
});

const queued = (id: string, status: 'delivered' | 'missed' | 'pending', at: string, qty?: string) => ({
  type: 'deliverySync/changeQueued',
  payload: { id, status, delivered_quantity: qty ?? null, client_updated_at: at },
});

describe('Offline delivery queue', () => {
  it('keeps only the latest change per stop', () => {
    let state = reducer(undefined, queued('a', 'delivered', '2026-10-03T06:00:00Z'));
    state = reducer(state, queued('a', 'missed', '2026-10-03T06:05:00Z'));
    state = reducer(state, queued('b', 'delivered', '2026-10-03T06:06:00Z'));
    expect(state.queue).toHaveLength(2);
    expect(state.queue.find((c) => c.id === 'a')?.status).toBe('missed');
  });

  it('keeps changes made while an upload was in flight', () => {
    let state = reducer(undefined, queued('a', 'delivered', '2026-10-03T06:00:00Z'));
    const sent = [...state.queue];
    // The gawali changes their mind before the upload returns.
    state = reducer(state, queued('a', 'pending', '2026-10-03T06:01:00Z'));
    state = reducer(state, { type: 'deliverySync/syncSucceeded', payload: { sent, rejected: [] } });
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].status).toBe('pending');
    expect(state.offline).toBe(false);
  });

  it('records rejected changes and clears them on a new change', () => {
    let state = reducer(undefined, queued('a', 'delivered', '2026-10-03T06:00:00Z'));
    state = reducer(state, {
      type: 'deliverySync/syncSucceeded',
      payload: { sent: [...state.queue], rejected: [{ id: 'a', detail: 'Too old' }] },
    });
    expect(state.queue).toHaveLength(0);
    expect(state.rejected).toEqual([{ id: 'a', detail: 'Too old' }]);
    state = reducer(state, queued('a', 'delivered', '2026-10-03T07:00:00Z'));
    expect(state.rejected).toHaveLength(0);
  });

  it('marks the queue offline when the server is unreachable', () => {
    const state = reducer(undefined, { type: 'deliverySync/syncFailedOffline' });
    expect(state.offline).toBe(true);
    expect(state.syncing).toBe(false);
  });

  it('overlays unsynced changes on the server route', () => {
    const merged = withPendingChanges(
      [stop('a'), stop('b')],
      [{ id: 'a', status: 'delivered', delivered_quantity: '2.00', client_updated_at: 'x' }]
    );
    expect(merged[0]).toMatchObject({ status: 'delivered', delivered_quantity: '2.00', pending: true });
    expect(merged[1]).toMatchObject({ status: 'pending', pending: false });
  });

  it('uses the scheduled quantity when none was given', () => {
    const [m] = withPendingChanges(
      [stop('a')],
      [{ id: 'a', status: 'delivered', delivered_quantity: null, client_updated_at: 'x' }]
    );
    expect(m.delivered_quantity).toBe('1.50');
  });
});
