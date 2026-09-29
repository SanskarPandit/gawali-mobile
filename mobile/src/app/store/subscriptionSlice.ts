import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface ProductItem {
  id: number;
  name: string;
  category: 'cow_milk' | 'buffalo_milk' | 'ghee' | 'paneer' | 'curd' | 'butter';
  unit: string;
  price: number;
  imageUrl?: string;
  isDailySubscription: boolean;
  description: string;
}

export interface DayOverride {
  date: string; // 'YYYY-MM-DD'
  quantity: number;
  status: 'scheduled' | 'delivered' | 'skipped' | 'cancelled';
  note?: string;
}

export interface SubscriptionState {
  defaultPlan: {
    productId: number;
    productName: string;
    quantity: number;
    unitPrice: number;
    deliveryTime: 'morning' | 'evening';
    startDate: string;
  };
  overrides: Record<string, DayOverride>; // key: 'YYYY-MM-DD'
  catalog: ProductItem[];
  cartAddons: { product: ProductItem; quantity: number }[];
  cutoffTimeStr: string; // '22:00:00'
}

const INITIAL_CATALOG: ProductItem[] = [
  {
    id: 1,
    name: 'Pure Desi Cow Milk (A2)',
    category: 'cow_milk',
    unit: 'L',
    price: 68,
    isDailySubscription: true,
    description: 'Farm-fresh raw cow milk delivered every morning before 7:00 AM.',
  },
  {
    id: 2,
    name: 'Rich Buffalo Milk (7% Fat)',
    category: 'buffalo_milk',
    unit: 'L',
    price: 76,
    isDailySubscription: true,
    description: 'Creamy, thick farm-sourced buffalo milk ideal for tea and desserts.',
  },
  {
    id: 3,
    name: 'Bilona Gir Cow Ghee (500ml)',
    category: 'ghee',
    unit: 'jar',
    price: 850,
    isDailySubscription: false,
    description: 'Traditional wood-churned Vedic Bilona A2 cow ghee.',
  },
  {
    id: 4,
    name: 'Fresh Malai Paneer (250g)',
    category: 'paneer',
    unit: 'pack',
    price: 110,
    isDailySubscription: false,
    description: 'Soft, melt-in-mouth artisanal fresh cottage cheese.',
  },
  {
    id: 5,
    name: 'Set Buffalo Curd / Dahi (500g)',
    category: 'curd',
    unit: 'tub',
    price: 55,
    isDailySubscription: false,
    description: 'Naturally fermented thick pot curd with sweet aroma.',
  },
  {
    id: 6,
    name: 'Fresh White Table Butter (200g)',
    category: 'butter',
    unit: 'pack',
    price: 130,
    isDailySubscription: false,
    description: 'Unsalted traditional desi makhan freshly churned daily.',
  },
];

const initialState: SubscriptionState = {
  defaultPlan: {
    productId: 1,
    productName: 'Pure Desi Cow Milk (A2)',
    quantity: 1.5,
    unitPrice: 68,
    deliveryTime: 'morning',
    startDate: '2026-08-01',
  },
  overrides: {
    '2026-09-24': { date: '2026-09-24', quantity: 1.5, status: 'delivered' },
    '2026-09-25': { date: '2026-09-25', quantity: 1.5, status: 'delivered' },
    '2026-09-26': { date: '2026-09-26', quantity: 1.5, status: 'scheduled' },
    '2026-09-27': { date: '2026-09-27', quantity: 0.0, status: 'skipped', note: 'Vacation' },
    '2026-09-28': { date: '2026-09-28', quantity: 2.0, status: 'scheduled', note: 'Guests visiting' },
  },
  catalog: INITIAL_CATALOG,
  cartAddons: [],
  cutoffTimeStr: '22:00:00',
};

export const subscriptionSlice = createSlice({
  name: 'subscription',
  initialState,
  reducers: {
    setDayOverride: (
      state,
      action: PayloadAction<{ date: string; quantity: number; note?: string }>
    ) => {
      const { date, quantity, note } = action.payload;
      state.overrides[date] = {
        date,
        quantity,
        status: quantity === 0 ? 'skipped' : 'scheduled',
        note,
      };
    },
    resetDayOverride: (state, action: PayloadAction<string>) => {
      delete state.overrides[action.payload];
    },
    updateDefaultPlan: (
      state,
      action: PayloadAction<{ quantity: number; productId?: number }>
    ) => {
      state.defaultPlan.quantity = action.payload.quantity;
      if (action.payload.productId) {
        const prod = state.catalog.find((p) => p.id === action.payload.productId);
        if (prod) {
          state.defaultPlan.productId = prod.id;
          state.defaultPlan.productName = prod.name;
          state.defaultPlan.unitPrice = prod.price;
        }
      }
    },
    addAddonToCart: (state, action: PayloadAction<{ product: ProductItem; quantity: number }>) => {
      const idx = state.cartAddons.findIndex((item) => item.product.id === action.payload.product.id);
      if (idx >= 0) {
        state.cartAddons[idx].quantity += action.payload.quantity;
      } else {
        state.cartAddons.push(action.payload);
      }
    },
    removeAddonFromCart: (state, action: PayloadAction<number>) => {
      state.cartAddons = state.cartAddons.filter((item) => item.product.id !== action.payload);
    },
    clearCart: (state) => {
      state.cartAddons = [];
    },
  },
});

export const {
  setDayOverride,
  resetDayOverride,
  updateDefaultPlan,
  addAddonToCart,
  removeAddonFromCart,
  clearCart,
} = subscriptionSlice.actions;

export default subscriptionSlice.reducer;
