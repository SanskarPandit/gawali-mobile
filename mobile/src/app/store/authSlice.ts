import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../shared/api/apiClient';
import { getApiErrorMessage } from '../../shared/api/errors';
import { tokenStorage } from '../../shared/storage/tokenStorage';
import { resetDemoServer } from '../../shared/api/demo/demoServer';

export type UserRole = 'customer' | 'dairy' | 'delivery_boy' | 'admin';
export type Language = 'en' | 'hi' | 'mr';

/** `live` = signed in against the backend; `demo` = local sample data, nothing is saved. */
export type SessionMode = 'live' | 'demo';

export interface UserProfile {
  id: string;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  dairyId?: string;
  dairyName?: string;
  customerId?: string;
  deliveryAddress?: string;
  latitude?: number;
  longitude?: number;
  preferredLanguage?: Language;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  sessionMode: SessionMode | null;
  error: string | null;
  currentLanguage: Language;
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  sessionMode: null,
  error: null,
  currentLanguage: 'en',
};

// Sample personas for demo mode only. They never touch the backend.
export const DEMO_USERS: Record<UserRole, UserProfile> = {
  customer: {
    id: 'demo-customer',
    email: 'rahul.patil@example.com',
    phone: '+919876543212',
    fullName: 'Rahul Patil',
    role: 'customer',
    customerId: 'demo-customer-profile',
    dairyId: 'demo-dairy',
    dairyName: 'Badhale Dairy',
    deliveryAddress: 'Flat 402, Green Acres, Baner, Pune - 411045',
    latitude: 18.559658,
    longitude: 73.779434,
    preferredLanguage: 'mr',
  },
  dairy: {
    id: 'demo-dairy-owner',
    email: 'shailesh.badhale@gawali.app',
    phone: '+919876543211',
    fullName: 'Shailesh Badhale',
    role: 'dairy',
    dairyId: 'demo-dairy',
    dairyName: 'Badhale Dairy',
    preferredLanguage: 'mr',
  },
  delivery_boy: {
    id: 'demo-gawali',
    email: 'suresh.kadam@gawali.app',
    phone: '+919876543213',
    fullName: 'Suresh Kadam',
    role: 'delivery_boy',
    dairyId: 'demo-dairy',
    dairyName: 'Badhale Dairy',
    preferredLanguage: 'mr',
  },
  admin: {
    id: 'demo-admin',
    email: 'mahesh.garade@gawali.app',
    phone: '+919876543210',
    fullName: 'Mahesh Garade',
    role: 'admin',
    preferredLanguage: 'en',
  },
};

const DEMO_ONLY_MESSAGE = 'This is not available in demo mode. Exit demo mode and sign in to your account.';

/** Maps the backend `/auth/me/` payload (snake_case) onto the app's profile shape. */
const mapApiUser = (data: any): UserProfile => ({
  id: String(data.id),
  email: data.email,
  phone: data.phone ?? '',
  fullName: data.full_name,
  role: data.role,
  dairyId: data.dairy_id ?? undefined,
  dairyName: data.business_name ?? undefined,
  customerId: data.customer_id ?? undefined,
});

const fetchMe = async (): Promise<UserProfile> => {
  const res = await apiClient.get('/auth/me/');
  return mapApiUser(res.data);
};

type ThunkState = { auth: AuthState };
const isDemo = (getState: () => unknown) => (getState() as ThunkState).auth.sessionMode === 'demo';

export const loginWithCredentials = createAsyncThunk<UserProfile, { email: string; password: string }, { rejectValue: string }>(
  'auth/loginWithCredentials',
  async ({ email, password }, { rejectWithValue }) => {
    try {
      const res = await apiClient.post('/auth/login/', {
        email: email.trim().toLowerCase(),
        password,
      });
      await tokenStorage.setTokens(res.data.access, res.data.refresh);
      return await fetchMe();
    } catch (err) {
      await tokenStorage.clear();
      return rejectWithValue(getApiErrorMessage(err, 'Incorrect email or password.'));
    }
  }
);

export const registerCustomer = createAsyncThunk<
  UserProfile,
  { fullName: string; email: string; phone: string; password: string },
  { rejectValue: string }
>('auth/registerCustomer', async (input, { rejectWithValue }) => {
  try {
    // The backend always creates a customer; other roles are provisioned by an admin.
    const res = await apiClient.post('/auth/signup/', {
      full_name: input.fullName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone.trim() || null,
      password: input.password,
    });
    await tokenStorage.setTokens(res.data.tokens.access, res.data.tokens.refresh);
    return await fetchMe();
  } catch (err) {
    await tokenStorage.clear();
    return rejectWithValue(getApiErrorMessage(err, 'Could not create your account. Please try again.'));
  }
});

export const updateProfile = createAsyncThunk<
  Partial<UserProfile>,
  { fullName: string; phone: string },
  { rejectValue: string }
>('auth/updateProfile', async ({ fullName, phone }, { getState, rejectWithValue }) => {
  if (isDemo(getState)) {
    return { fullName: fullName.trim(), phone: phone.trim() };
  }
  try {
    const res = await apiClient.patch('/auth/me/', { full_name: fullName.trim(), phone: phone.trim() || null });
    return mapApiUser(res.data);
  } catch (err) {
    return rejectWithValue(getApiErrorMessage(err, 'Could not save your details.'));
  }
});

export const changePassword = createAsyncThunk<void, { oldPassword: string; newPassword: string }, { rejectValue: string }>(
  'auth/changePassword',
  async ({ oldPassword, newPassword }, { getState, rejectWithValue }) => {
    if (isDemo(getState)) return rejectWithValue(DEMO_ONLY_MESSAGE);
    try {
      await apiClient.post('/auth/change-password/', { old_password: oldPassword, new_password: newPassword });
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Could not change your password.'));
    }
  }
);

/** Ends the session everywhere: revokes the refresh token server-side, then wipes local state. */
export const signOut = createAsyncThunk('auth/signOut', async (_, { getState, dispatch }) => {
  if (!isDemo(getState)) {
    const refresh = await tokenStorage.getRefreshToken();
    if (refresh) {
      // Best effort: a failed revoke must never keep the user signed in on this device.
      await apiClient.post('/auth/logout/', { refresh }).catch(() => undefined);
    }
  }
  await tokenStorage.clear();
  resetDemoServer();
  dispatch(sessionEnded());
});

export const deleteAccount = createAsyncThunk<void, { password: string }, { rejectValue: string }>(
  'auth/deleteAccount',
  async ({ password }, { getState, dispatch, rejectWithValue }) => {
    if (isDemo(getState)) return rejectWithValue(DEMO_ONLY_MESSAGE);
    try {
      await apiClient.delete('/auth/me/', { data: { password } });
    } catch (err) {
      return rejectWithValue(getApiErrorMessage(err, 'Could not delete your account.'));
    }
    await tokenStorage.clear();
    dispatch(sessionEnded());
  }
);

const signIn = (state: AuthState, user: UserProfile, mode: SessionMode) => {
  state.user = user;
  state.sessionMode = mode;
  state.isAuthenticated = true;
  state.isLoading = false;
  state.error = null;
  if (user.preferredLanguage) {
    state.currentLanguage = user.preferredLanguage;
  }
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    startDemo: (state, action: PayloadAction<UserRole>) => {
      signIn(state, DEMO_USERS[action.payload], 'demo');
    },
    /** Handled by the root reducer too: every slice is reset so no data leaks into the next session. */
    sessionEnded: (state) => {
      state.user = null;
      state.sessionMode = null;
      state.isAuthenticated = false;
      state.isLoading = false;
      state.error = null;
    },
    clearAuthError: (state) => {
      state.error = null;
    },
    setLanguage: (state, action: PayloadAction<Language>) => {
      state.currentLanguage = action.payload;
      if (state.user) {
        state.user.preferredLanguage = action.payload;
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginWithCredentials.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithCredentials.fulfilled, (state, action) => {
        signIn(state, action.payload, 'live');
      })
      .addCase(loginWithCredentials.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Sign in failed.';
      })
      .addCase(registerCustomer.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerCustomer.fulfilled, (state, action) => {
        signIn(state, action.payload, 'live');
      })
      .addCase(registerCustomer.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload ?? 'Sign up failed.';
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        if (state.user) {
          // Never let a profile response change who the user is or what they may access.
          const changes = { ...action.payload };
          delete changes.role;
          delete changes.id;
          state.user = { ...state.user, ...changes };
        }
      });
  },
});

export const { startDemo, sessionEnded, clearAuthError, setLanguage } = authSlice.actions;
export default authSlice.reducer;
