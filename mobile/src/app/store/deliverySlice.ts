import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface RouteCustomer {
  id: number;
  deliveryId: number;
  name: string;
  phone: string;
  address: string;
  wingFlat: string;
  sequenceOrder: number;
  productName: string;
  quantity: number;
  status: 'pending' | 'delivered' | 'skipped';
  deliveredAt?: string;
  specialInstructions?: string;
  latitude: number;
  longitude: number;
  balanceAmount: number;
}

interface DeliveryState {
  selectedDate: string; // 'YYYY-MM-DD'
  activeShift: 'morning' | 'evening';
  routeCustomers: RouteCustomer[];
  searchQuery: string;
}

const INITIAL_CUSTOMERS: RouteCustomer[] = [
  {
    id: 1,
    deliveryId: 101,
    name: 'Rahul Patil',
    phone: '+919876543212',
    address: 'Flat 402, Green Acres, Baner Road',
    wingFlat: 'A-402',
    sequenceOrder: 1,
    productName: 'A2 Cow Milk',
    quantity: 1.5,
    status: 'delivered',
    deliveredAt: '06:15 AM',
    specialInstructions: 'Ring bell once and leave in milk bag on handle',
    latitude: 18.559658,
    longitude: 73.779434,
    balanceAmount: 1420,
  },
  {
    id: 2,
    deliveryId: 102,
    name: 'Anjali Sharma',
    phone: '+919876543215',
    address: 'Flat 201, Green Acres, Baner Road',
    wingFlat: 'A-201',
    sequenceOrder: 2,
    productName: 'Buffalo Milk',
    quantity: 2.0,
    status: 'delivered',
    deliveredAt: '06:22 AM',
    specialInstructions: 'Leave in thermal cooler outside door',
    latitude: 18.559812,
    longitude: 73.779512,
    balanceAmount: 2280,
  },
  {
    id: 3,
    deliveryId: 103,
    name: 'Vikram Joshi',
    phone: '+919876543216',
    address: 'Flat 503, Symphony Heights, Baner',
    wingFlat: 'B-503',
    sequenceOrder: 3,
    productName: 'A2 Cow Milk',
    quantity: 1.0,
    status: 'pending',
    specialInstructions: 'Do not ring bell before 7 AM',
    latitude: 18.561204,
    longitude: 73.781190,
    balanceAmount: 0,
  },
  {
    id: 4,
    deliveryId: 104,
    name: 'Pooja Deshmukh',
    phone: '+919876543217',
    address: 'Flat 104, Symphony Heights, Baner',
    wingFlat: 'B-104',
    sequenceOrder: 4,
    productName: 'Buffalo Milk',
    quantity: 1.5,
    status: 'pending',
    specialInstructions: 'Direct hand delivery only',
    latitude: 18.561320,
    longitude: 73.781250,
    balanceAmount: 3150, // Overdue
  },
  {
    id: 5,
    deliveryId: 105,
    name: 'Amitabh Kulkarni',
    phone: '+919876543218',
    address: 'Bungalow 12, Rohan Meadows, Aundh',
    wingFlat: 'Villa 12',
    sequenceOrder: 5,
    productName: 'A2 Cow Milk',
    quantity: 0.0,
    status: 'skipped',
    specialInstructions: 'Customer marked Skip via Gawali app',
    latitude: 18.563450,
    longitude: 73.784500,
    balanceAmount: 680,
  },
  {
    id: 6,
    deliveryId: 106,
    name: 'Sneha More',
    phone: '+919876543219',
    address: 'Flat 601, Pristine Palms, Wakad',
    wingFlat: 'C-601',
    sequenceOrder: 6,
    productName: 'A2 Cow Milk',
    quantity: 2.0,
    status: 'pending',
    specialInstructions: 'Collect empty glass bottle from shelf',
    latitude: 18.598210,
    longitude: 73.763420,
    balanceAmount: 1850,
  },
];

const initialState: DeliveryState = {
  selectedDate: new Date().toISOString().split('T')[0],
  activeShift: 'morning',
  routeCustomers: INITIAL_CUSTOMERS,
  searchQuery: '',
};

export const deliverySlice = createSlice({
  name: 'delivery',
  initialState,
  reducers: {
    setSelectedDate: (state, action: PayloadAction<string>) => {
      state.selectedDate = action.payload;
    },
    setActiveShift: (state, action: PayloadAction<'morning' | 'evening'>) => {
      state.activeShift = action.payload;
    },
    setSearchQuery: (state, action: PayloadAction<string>) => {
      state.searchQuery = action.payload;
    },
    updateDeliveryStatus: (
      state,
      action: PayloadAction<{ customerId: number; status: 'pending' | 'delivered' | 'skipped' }>
    ) => {
      const item = state.routeCustomers.find((c) => c.id === action.payload.customerId);
      if (item) {
        item.status = action.payload.status;
        if (action.payload.status === 'delivered') {
          const now = new Date();
          item.deliveredAt = `${now.getHours().toString().padStart(2, '0')}:${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;
        }
      }
    },
    updateCustomerBalance: (
      state,
      action: PayloadAction<{ customerId: number; newBalance: number }>
    ) => {
      const item = state.routeCustomers.find((c) => c.id === action.payload.customerId);
      if (item) {
        item.balanceAmount = action.payload.newBalance;
      }
    },
  },
});

export const {
  setSelectedDate,
  setActiveShift,
  setSearchQuery,
  updateDeliveryStatus,
  updateCustomerBalance,
} = deliverySlice.actions;

export default deliverySlice.reducer;
