import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer from './authSlice';
import subscriptionReducer from './subscriptionSlice';
import deliveryReducer from './deliverySlice';
import billingReducer from './billingSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    subscription: subscriptionReducer,
    delivery: deliveryReducer,
    billing: billingReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
