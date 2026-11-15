import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, tokens } from './api';
import type { Role, User } from './types';
import { disablePushForThisDevice, refreshPushIfAllowed } from './push';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<User>;
  acceptSession: (access: string, refresh: string) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const homePathFor = (role: Role) =>
  role === 'dairy' ? '/console' : role === 'delivery_boy' ? '/route' : role === 'customer' ? '/app' : role === 'admin' ? '/control' : '/login';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const qc = useQueryClient();

  const loadMe = useCallback(async () => {
    const me = await api<User>('/api/v1/auth/me/');
    setUser(me);
    refreshPushIfAllowed();
    return me;
  }, []);

  useEffect(() => {
    tokens.onLogout(() => {
      setUser(null);
      qc.clear();
    });
    if (!tokens.access) {
      setReady(true);
      return;
    }
    loadMe()
      .catch(() => tokens.clear())
      .finally(() => setReady(true));
  }, [loadMe, qc]);

  const acceptSession = useCallback(
    async (access: string, refresh: string) => {
      tokens.set(access, refresh);
      qc.clear();
      return loadMe();
    },
    [loadMe, qc],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const data = await api<{ access: string; refresh: string }>('/api/v1/auth/login/', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), password },
        auth: false,
      });
      return acceptSession(data.access, data.refresh);
    },
    [acceptSession],
  );

  const logout = useCallback(async () => {
    await disablePushForThisDevice();
    const refresh = tokens.refresh;
    if (refresh) await api('/api/v1/auth/logout/', { method: 'POST', body: { refresh } }).catch(() => undefined);
    tokens.clear();
    setUser(null);
    qc.clear();
  }, [qc]);

  const value = useMemo(
    () => ({ user, ready, login, acceptSession, logout, refreshUser: async () => void (await loadMe()) }),
    [user, ready, login, acceptSession, logout, loadMe],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
