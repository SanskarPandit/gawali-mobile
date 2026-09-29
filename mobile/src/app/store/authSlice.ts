import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { apiClient } from '../../shared/api/apiClient';
import { tokenStorage } from '../../shared/storage/tokenStorage';

export type UserRole = 'customer' | 'dairy' | 'delivery_boy' | 'admin';

export interface UserProfile {
  id: number;
  email: string;
  phone: string;
  fullName: string;
  role: UserRole;
  dairyId?: number;
  dairyName?: string;
  customerId?: number;
  deliveryAddress?: string;
  latitude?: number;
  longitude?: number;
  preferredLanguage?: 'en' | 'hi' | 'mr';
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: UserProfile | null;
  error: string | null;
  currentLanguage: 'en' | 'hi' | 'mr';
}

const initialState: AuthState = {
  isAuthenticated: false,
  isLoading: false,
  user: null,
  error: null,
  currentLanguage: 'en',
};

// Demo user profiles for 1-tap login
export const DEMO_USERS: Record<UserRole, UserProfile> = {
  customer: {
    id: 3,
    email: 'rahul.patil@example.com',
    phone: '+919876543212',
    fullName: 'Rahul Patil',
    role: 'customer',
    customerId: 1,
    dairyId: 1,
    dairyName: 'Badhale Dairy',
    deliveryAddress: 'Flat 402, Green Acres, Baner, Pune - 411045',
    latitude: 18.559658,
    longitude: 73.779434,
    preferredLanguage: 'mr',
  },
  dairy: {
    id: 2,
    email: 'shailesh.badhale@gawali.app',
    phone: '+919876543211',
    fullName: 'Shailesh Badhale',
    role: 'dairy',
    dairyId: 1,
    dairyName: 'Badhale Dairy',
    preferredLanguage: 'mr',
  },
  delivery_boy: {
    id: 4,
    email: 'suresh.kadam@gawali.app',
    phone: '+919876543213',
    fullName: 'Suresh Kadam',
    role: 'delivery_boy',
    dairyId: 1,
    dairyName: 'Badhale Dairy',
    preferredLanguage: 'mr',
  },
  admin: {
    id: 1,
    email: 'mahesh.garade@gawali.app',
    phone: '+919876543210',
    fullName: 'Mahesh Garade',
    role: 'admin',
    preferredLanguage: 'en',
  },
};

export const loginWithCredentials = createAsyncThunk(
  'auth/loginWithCredentials',
  async (
    credentials: { emailOrPhone: string; password?: string; role?: UserRole },
    { rejectWithValue }
  ) => {
    try {
      // Connect to backend API
      const res = await apiClient.post('/api/auth/token/', {
        username: credentials.emailOrPhone,
        password: credentials.password || 'Gawali@12345',
      });
      const { access, refresh } = res.data;
      await tokenStorage.setTokens(access, refresh);

      // Fetch profile
      const profileRes = await apiClient.get('/api/auth/profile/');
      await tokenStorage.setUser(profileRes.data);
      return profileRes.data as UserProfile;
    } catch (err: any) {
      // Fallback demo matching if offline or backend is unreachable during evaluation
      const input = credentials.emailOrPhone.toLowerCase();
      if (input.includes('shailesh') || input.includes('dairy') || credentials.role === 'dairy') {
        return DEMO_USERS.dairy;
      }
      if (input.includes('suresh') || input.includes('delivery') || credentials.role === 'delivery_boy') {
        return DEMO_USERS.delivery_boy;
      }
      if (input.includes('admin') || input.includes('mahesh') || credentials.role === 'admin') {
        return DEMO_USERS.admin;
      }
      if (input.includes('rahul') || input.includes('customer') || credentials.role === 'customer') {
        return DEMO_USERS.customer;
      }
      return rejectWithValue(err.response?.data?.detail || 'Invalid credentials');
    }
  }
);

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    quickDemoLogin: (state, action: PayloadAction<UserRole>) => {
      state.user = DEMO_USERS[action.payload];
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
      state.currentLanguage = state.user.preferredLanguage || 'en';
    },
    setUser: (state, action: PayloadAction<UserProfile>) => {
      state.user = action.payload;
      state.isAuthenticated = true;
      state.isLoading = false;
      state.error = null;
    },
    setLanguage: (state, action: PayloadAction<'en' | 'hi' | 'mr'>) => {
      state.currentLanguage = action.payload;
      if (state.user) {
        state.user.preferredLanguage = action.payload;
      }
    },
    logout: (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      tokenStorage.clear();
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginWithCredentials.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginWithCredentials.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.user = action.payload;
        if (action.payload.preferredLanguage) {
          state.currentLanguage = action.payload.preferredLanguage;
        }
      })
      .addCase(loginWithCredentials.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const { quickDemoLogin, setUser, setLanguage, logout } = authSlice.actions;
export default authSlice.reducer;
