import { useQuery } from '@tanstack/react-query';
import { api } from './api';

export interface AppConfig {
  payments_enabled: boolean;
  passport_enabled: boolean;
}

/** Feature switches from the server (payments, purity passport). */
export const useAppConfig = () =>
  useQuery({
    queryKey: ['app-config'],
    queryFn: () => api<AppConfig>('/api/v2/config/', { auth: false }),
    staleTime: 10 * 60_000,
    placeholderData: { payments_enabled: false, passport_enabled: false },
  });
