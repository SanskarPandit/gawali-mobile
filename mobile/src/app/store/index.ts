import { combineReducers, configureStore, UnknownAction } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { AppState } from 'react-native';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import authReducer, { sessionEnded } from './authSlice';
import adminReducer from './adminSlice';
import deliverySyncReducer from './deliverySyncSlice';
import { setSessionExpiredHandler } from '../../shared/api/apiClient';
import { gawaliApi } from '../../shared/api/gawaliApi';

const appReducer = combineReducers({
  auth: authReducer,
  admin: adminReducer,
  deliverySync: deliverySyncReducer,
  [gawaliApi.reducerPath]: gawaliApi.reducer,
});

type AppStoreState = ReturnType<typeof appReducer>;

// Ending a session wipes every slice so nothing from one account (or the demo) leaks into the next.
// Only the chosen app language survives, since it belongs to the device rather than the account.
const rootReducer = (state: AppStoreState | undefined, action: UnknownAction): AppStoreState => {
  if (sessionEnded.match(action)) {
    const fresh = appReducer(undefined, action);
    return {
      ...fresh,
      auth: { ...fresh.auth, currentLanguage: state?.auth.currentLanguage ?? fresh.auth.currentLanguage },
    };
  }
  return appReducer(state, action);
};

export const store = configureStore({
  reducer: rootReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(gawaliApi.middleware),
});

setSessionExpiredHandler(() => store.dispatch(sessionEnded()));

// Refetch stale screens when the app comes back to the foreground.
setupListeners(store.dispatch, (dispatch, { onFocus, onFocusLost }) => {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') dispatch(onFocus());
    else dispatch(onFocusLost());
  });
  return () => sub.remove();
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
