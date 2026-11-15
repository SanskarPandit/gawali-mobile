import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../shared/api/apiClient';
import { getApiErrorMessage } from '../../shared/api/errors';
import type { SessionMode, UserRole } from './authSlice';

export interface AdminAccount {
  id: string;
  role: UserRole;
  fullName: string;
  email: string;
  phone: string;
  isActive: boolean;
  dairyId?: string;
  dairyName?: string;
  createdAt: string;
}

/** Admins provision only dairy owners and gawalis; customers sign up themselves. */
export type NewAccountInput =
  | {
      role: 'dairy';
      fullName: string;
      email: string;
      phone: string;
      businessName: string;
      city: string;
    }
  | {
      role: 'delivery_boy';
      fullName: string;
      email: string;
      phone: string;
      dairyId: string;
      vehicleNumber: string;
    };

interface AdminState {
  accounts: AdminAccount[];
  status: 'idle' | 'loading' | 'succeeded' | 'failed';
  error: string | null;
  activeTab: 'dairies' | 'users';
}

const DEMO_ACCOUNTS: AdminAccount[] = [
  { id: 'demo-dairy-owner', role: 'dairy', fullName: 'Shailesh Badhale', email: 'shailesh.badhale@gawali.app', phone: '+919876543211', isActive: true, dairyId: 'demo-dairy', dairyName: 'Badhale Dairy & Farm', createdAt: '2026-07-15' },
  { id: 'demo-dairy-2', role: 'dairy', fullName: 'Ramesh Katrajkar', email: 'ramesh.katraj@gawali.app', phone: '+919876543220', isActive: true, dairyId: 'demo-dairy-2-biz', dairyName: 'Katraj Fresh Milk Dairy', createdAt: '2026-08-01' },
  { id: 'demo-dairy-3', role: 'dairy', fullName: 'Nitin Pawar', email: 'nitin.shivamrut@gawali.app', phone: '+919876543221', isActive: true, dairyId: 'demo-dairy-3-biz', dairyName: 'Shivamrut Organics', createdAt: '2026-08-10' },
  { id: 'demo-dairy-4', role: 'dairy', fullName: 'Anil Jagtap', email: 'anil.baramati@gawali.app', phone: '+919876543222', isActive: false, dairyId: 'demo-dairy-4-biz', dairyName: 'Baramati Cow Milk Center', createdAt: '2026-09-02' },
  { id: 'demo-gawali', role: 'delivery_boy', fullName: 'Suresh Kadam', email: 'suresh.kadam@gawali.app', phone: '+919876543213', isActive: true, dairyId: 'demo-dairy', dairyName: 'Badhale Dairy & Farm', createdAt: '2026-07-20' },
  { id: 'demo-customer', role: 'customer', fullName: 'Rahul Patil', email: 'rahul.patil@example.com', phone: '+919876543212', isActive: true, createdAt: '2026-08-01' },
  { id: 'demo-customer-2', role: 'customer', fullName: 'Anjali Sharma', email: 'anjali.sharma@example.com', phone: '+919876543215', isActive: true, createdAt: '2026-08-05' },
  { id: 'demo-customer-3', role: 'customer', fullName: 'Vikram Joshi', email: 'vikram.joshi@example.com', phone: '+919876543216', isActive: true, createdAt: '2026-08-12' },
  { id: 'demo-admin', role: 'admin', fullName: 'Mahesh Garade', email: 'mahesh.garade@gawali.app', phone: '+919876543210', isActive: true, createdAt: '2026-07-01' },
];

const initialState: AdminState = {
  accounts: [],
  status: 'idle',
  error: null,
  activeTab: 'dairies',
};

const mapApiAccount = (a: any): AdminAccount => ({
  id: String(a.id),
  role: a.role,
  fullName: a.full_name,
  email: a.email,
  phone: a.phone ?? '',
  isActive: a.is_active,
  dairyId: a.dairy_id ?? undefined,
  dairyName: a.dairy_name ?? undefined,
  createdAt: String(a.created_at).slice(0, 10),
});

type ThunkState = { auth: { sessionMode: SessionMode | null }; admin: AdminState };
const isDemo = (getState: () => unknown) => (getState() as ThunkState).auth.sessionMode === 'demo';

const demoTemporaryPassword = () => `Gw${Math.random().toString(36).slice(2, 8)}${Math.floor(10 + Math.random() * 89)}`;

export const fetchAccounts = createAsyncThunk<AdminAccount[] | null, void, { rejectValue: string }>(
  'admin/fetchAccounts',
  async (_, { getState, rejectWithValue }) => {
    if (isDemo(getState)) {
      // Seed the sample directory once; keep demo edits for the rest of the demo session.
      return (getState() as ThunkState).admin.accounts.length ? null : DEMO_ACCOUNTS;
    }
    try {
      const rows: any[] = [];
      for (let page = 1; ; page++) {
        const res = await apiClient.get('/auth/admin/accounts/', { params: { page, page_size: 100 } });
        if (Array.isArray(res.data)) {
          rows.push(...res.data);
          break;
        }
        rows.push(...res.data.results);
        if (!res.data.next) break;
      }
      return rows.map(mapApiAccount);
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Could not load accounts.'));
    }
  }
);

export const createAccount = createAsyncThunk<
  { account: AdminAccount; temporaryPassword: string },
  NewAccountInput,
  { rejectValue: string }
>('admin/createAccount', async (input, { getState, rejectWithValue }) => {
  const email = input.email.trim().toLowerCase();

  if (isDemo(getState)) {
    const { accounts } = (getState() as ThunkState).admin;
    if (accounts.some((a) => a.email === email)) {
      return rejectWithValue('An account with this email already exists.');
    }
    const dairy = input.role === 'delivery_boy' ? accounts.find((a) => a.dairyId === input.dairyId) : undefined;
    return {
      account: {
        id: `demo-${Date.now()}`,
        role: input.role,
        fullName: input.fullName.trim(),
        email,
        phone: input.phone.trim(),
        isActive: true,
        dairyId: input.role === 'dairy' ? `demo-biz-${Date.now()}` : input.dairyId,
        dairyName: input.role === 'dairy' ? input.businessName.trim() : dairy?.dairyName,
        createdAt: new Date().toISOString().slice(0, 10),
      },
      temporaryPassword: demoTemporaryPassword(),
    };
  }

  const payload =
    input.role === 'dairy'
      ? { role: 'dairy', full_name: input.fullName.trim(), email, phone: input.phone.trim(), business_name: input.businessName.trim(), city: input.city.trim() }
      : { role: 'delivery_boy', full_name: input.fullName.trim(), email, phone: input.phone.trim(), dairy_id: input.dairyId, vehicle_number: input.vehicleNumber.trim() };
  try {
    const res = await apiClient.post('/auth/admin/accounts/', payload);
    return { account: mapApiAccount(res.data), temporaryPassword: res.data.temporary_password };
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Could not create the account.'));
  }
});

export const setAccountActive = createAsyncThunk<AdminAccount, { id: string; isActive: boolean }, { rejectValue: string }>(
  'admin/setAccountActive',
  async ({ id, isActive }, { getState, rejectWithValue }) => {
    if (isDemo(getState)) {
      const account = (getState() as ThunkState).admin.accounts.find((a) => a.id === id);
      if (!account) return rejectWithValue('Account not found.');
      return { ...account, isActive };
    }
    try {
      const res = await apiClient.patch(`/auth/admin/accounts/${id}/status/`, { is_active: isActive });
      return mapApiAccount(res.data);
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Could not update the account.'));
    }
  }
);

export const adminSlice = createSlice({
  name: 'admin',
  initialState,
  reducers: {
    setActiveAdminTab: (state, action: PayloadAction<'dairies' | 'users'>) => {
      state.activeTab = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAccounts.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchAccounts.fulfilled, (state, action) => {
        state.status = 'succeeded';
        if (action.payload) state.accounts = action.payload;
      })
      .addCase(fetchAccounts.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload ?? 'Could not load accounts.';
      })
      .addCase(createAccount.fulfilled, (state, action) => {
        state.accounts.unshift(action.payload.account);
      })
      .addCase(setAccountActive.fulfilled, (state, action) => {
        const i = state.accounts.findIndex((a) => a.id === action.payload.id);
        if (i >= 0) state.accounts[i] = action.payload;
      });
  },
});

export const { setActiveAdminTab } = adminSlice.actions;
export default adminSlice.reducer;
