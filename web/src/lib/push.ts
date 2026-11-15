import { api } from './api';
import { firebaseApp } from './firebase';

interface PushConfig {
  enabled: boolean;
  server_ready: boolean;
  config: Record<string, string> | null;
  vapidKey: string | null;
}

let cached: Promise<PushConfig> | null = null;
export const pushConfig = () => (cached ??= api<PushConfig>('/api/v2/push/config/', { auth: false }).catch(() => ({ enabled: false, server_ready: false, config: null, vapidKey: null })));

export const pushSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;

const TOKEN_KEY = 'gawali.fcm';

/** Ask permission, get an FCM token for this browser and register it with the backend. */
export async function enablePush(): Promise<'enabled' | 'denied' | 'unavailable'> {
  const cfg = await pushConfig();
  if (!cfg.enabled || !cfg.vapidKey || !pushSupported()) return 'unavailable';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  const [{ getMessaging, getToken, onMessage, isSupported }, app] = await Promise.all([import('firebase/messaging'), firebaseApp()]);
  if (!(await isSupported())) return 'unavailable';
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(getMessaging(app), { vapidKey: cfg.vapidKey, serviceWorkerRegistration: registration });
  if (!token) return 'unavailable';
  await api('/api/v2/devices/', { method: 'POST', body: { token, platform: 'web' } });
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
  onMessage(getMessaging(app), (payload) => {
    const n = payload.notification;
    if (n?.title && Notification.permission === 'granted') new Notification(n.title, { body: n.body, icon: '/favicon.svg' });
  });
  return 'enabled';
}

/** Re-register silently on each visit once the user has allowed notifications. */
export async function refreshPushIfAllowed() {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  try {
    await enablePush();
  } catch {
    /* push is best-effort */
  }
}

export async function disablePushForThisDevice() {
  let token: string | null = null;
  try {
    token = localStorage.getItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (token) await api('/api/v2/devices/', { method: 'DELETE', body: { token } }).catch(() => undefined);
}
