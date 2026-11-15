import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { gawaliApi } from '../../shared/api/gawaliApi';
import type { ApiError } from '../../shared/api/baseQuery';
import type { Delivery, DeliveryChange, DeliveryStatus } from '../../shared/api/types';

/**
 * Offline-first delivery marking for gawalis.
 *
 * Every tap is recorded on the device first (and persisted), shown immediately,
 * and uploaded in batches whenever the server is reachable. The server resolves
 * conflicts by the time each change was made, so late uploads never overwrite
 * newer corrections from the dairy.
 */
export interface RejectedChange {
  id: string;
  detail: string;
}

interface DeliverySyncState {
  queue: DeliveryChange[];
  syncing: boolean;
  /** True when the last upload failed because the server could not be reached. */
  offline: boolean;
  lastSyncedAt: string | null;
  rejected: RejectedChange[];
}

const initialState: DeliverySyncState = {
  queue: [],
  syncing: false,
  offline: false,
  lastSyncedAt: null,
  rejected: [],
};

type ThunkState = {
  auth: { user: { id: string } | null; sessionMode: 'live' | 'demo' | null };
  deliverySync: DeliverySyncState;
};

const storageKey = (userId: string) => `gawali:deliveryQueue:${userId}`;

const persist = async (getState: () => unknown) => {
  const { auth, deliverySync } = getState() as ThunkState;
  // Demo changes are throwaway; live ones survive app restarts and logouts until uploaded.
  if (!auth.user || auth.sessionMode !== 'live') return;
  try {
    if (deliverySync.queue.length) {
      await AsyncStorage.setItem(storageKey(auth.user.id), JSON.stringify(deliverySync.queue));
    } else {
      await AsyncStorage.removeItem(storageKey(auth.user.id));
    }
  } catch {
    // Storage failures must never block marking a delivery; the in-memory queue still syncs.
  }
};

/** Load changes left on this device by an earlier session of the same gawali. */
export const hydrateDeliveryQueue = createAsyncThunk('deliverySync/hydrate', async (_, { getState }) => {
  const { auth } = getState() as ThunkState;
  if (!auth.user || auth.sessionMode !== 'live') return [] as DeliveryChange[];
  try {
    const raw = await AsyncStorage.getItem(storageKey(auth.user.id));
    return raw ? (JSON.parse(raw) as DeliveryChange[]) : [];
  } catch {
    return [];
  }
});

export const flushDeliveryQueue = createAsyncThunk('deliverySync/flush', async (_, { getState, dispatch }) => {
  const { deliverySync } = getState() as ThunkState;
  if (deliverySync.syncing || deliverySync.queue.length === 0) return null;

  const batch = deliverySync.queue.slice(0, 200);
  dispatch(syncStarted());
  try {
    const res = await dispatch(gawaliApi.endpoints.syncDeliveries.initiate(batch)).unwrap();
    const rejected: RejectedChange[] = res.results
      .filter((r) => r.result === 'rejected')
      .map((r) => ({ id: r.id, detail: r.detail ?? 'The server did not accept this change.' }));
    dispatch(syncSucceeded({ sent: batch, rejected }));
    dispatch(gawaliApi.util.invalidateTags(['GawaliRoute', 'Manifest', 'DairyDashboard']));
  } catch (err) {
    const error = err as ApiError;
    const unreachable = error?.status === 'NETWORK' || (typeof error?.status === 'number' && error.status >= 500);
    if (unreachable) {
      dispatch(syncFailedOffline());
    } else {
      // The whole batch was refused (e.g. malformed). Drop it so one bad batch cannot block the queue forever.
      dispatch(syncSucceeded({
        sent: batch,
        rejected: batch.map((c) => ({ id: c.id, detail: error?.message ?? 'The server did not accept this change.' })),
      }));
    }
  }
  await persist(getState);
  // More may have been queued while this batch was uploading.
  const after = (getState() as ThunkState).deliverySync;
  if (after.queue.length && !after.offline) {
    dispatch(flushDeliveryQueue());
  }
  return null;
});

/** Record a gawali's action at the doorstep. Shows instantly; uploads in the background. */
export const recordDeliveryChange = createAsyncThunk(
  'deliverySync/record',
  async (change: { id: string; status: DeliveryStatus; delivered_quantity?: string | null }, { getState, dispatch }) => {
    dispatch(changeQueued({ ...change, client_updated_at: new Date().toISOString() }));
    await persist(getState);
    dispatch(flushDeliveryQueue());
  }
);

const deliverySyncSlice = createSlice({
  name: 'deliverySync',
  initialState,
  reducers: {
    changeQueued: (state, action: PayloadAction<DeliveryChange>) => {
      const i = state.queue.findIndex((c) => c.id === action.payload.id);
      // Only the latest change per stop matters; it carries the newest timestamp.
      if (i >= 0) state.queue[i] = { ...state.queue[i], ...action.payload };
      else state.queue.push(action.payload);
      state.rejected = state.rejected.filter((r) => r.id !== action.payload.id);
    },
    syncStarted: (state) => {
      state.syncing = true;
    },
    syncSucceeded: (state, action: PayloadAction<{ sent: DeliveryChange[]; rejected: RejectedChange[] }>) => {
      const sentAt = new Map(action.payload.sent.map((c) => [c.id, c.client_updated_at]));
      // Keep anything changed again while this batch was in flight.
      state.queue = state.queue.filter((c) => !sentAt.has(c.id) || c.client_updated_at > sentAt.get(c.id)!);
      state.rejected = [...state.rejected.filter((r) => !action.payload.rejected.some((x) => x.id === r.id)), ...action.payload.rejected];
      state.syncing = false;
      state.offline = false;
      state.lastSyncedAt = new Date().toISOString();
    },
    syncFailedOffline: (state) => {
      state.syncing = false;
      state.offline = true;
    },
    dismissRejected: (state) => {
      state.rejected = [];
    },
  },
  extraReducers: (builder) => {
    builder.addCase(hydrateDeliveryQueue.fulfilled, (state, action) => {
      for (const change of action.payload) {
        if (!state.queue.some((c) => c.id === change.id)) state.queue.push(change);
      }
    });
  },
});

const { changeQueued, syncStarted, syncSucceeded, syncFailedOffline } = deliverySyncSlice.actions;
export const { dismissRejected } = deliverySyncSlice.actions;
export default deliverySyncSlice.reducer;

/** Server stops with this device's not-yet-uploaded changes laid on top. */
export const withPendingChanges = (stops: Delivery[], queue: DeliveryChange[]): (Delivery & { pending: boolean })[] =>
  stops.map((stop) => {
    const change = queue.find((c) => c.id === stop.id);
    if (!change) return { ...stop, pending: false };
    const status = change.status ?? stop.status;
    return {
      ...stop,
      status,
      delivered_quantity:
        status === 'delivered' ? change.delivered_quantity ?? stop.scheduled_quantity : '0.00',
      pending: true,
    };
  });
