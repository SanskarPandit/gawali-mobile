import type { FirebaseApp } from 'firebase/app';

// Firebase web config for project gawali-63588. These values identify the app; they are public by
// design and safe to ship in the browser bundle (access is controlled by Firebase rules and App Check).
export const firebaseConfig = {
  apiKey: 'AIzaSyBHlxMCN_BungqIRSl488pCDxkuIfABYzM',
  authDomain: 'gawali-63588.firebaseapp.com',
  projectId: 'gawali-63588',
  storageBucket: 'gawali-63588.firebasestorage.app',
  messagingSenderId: '333632717166',
  appId: '1:333632717166:web:8b1862398ed43e2876017f',
  measurementId: 'G-50S1R3BC0Q',
};

let appPromise: Promise<FirebaseApp> | null = null;

/** The single Firebase app instance, loaded on demand so it never slows the first paint. */
export function firebaseApp(): Promise<FirebaseApp> {
  appPromise ??= import('firebase/app').then(({ initializeApp, getApps }) => getApps()[0] ?? initializeApp(firebaseConfig));
  return appPromise;
}

/** Google Analytics for Firebase — production builds only, and only where the browser supports it. */
export async function startAnalytics() {
  if (!import.meta.env.PROD) return;
  try {
    const [{ getAnalytics, isSupported }, app] = await Promise.all([import('firebase/analytics'), firebaseApp()]);
    if (await isSupported()) getAnalytics(app);
  } catch {
    /* analytics is optional */
  }
}
