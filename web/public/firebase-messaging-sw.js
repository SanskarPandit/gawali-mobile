/* Firebase Cloud Messaging service worker: shows pushes while the app is closed. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if ('focus' in c) { c.navigate(link); return c.focus(); }
    return clients.openWindow(link);
  }));
});

fetch('/api/v2/push/config/')
  .then((r) => r.json())
  .then((cfg) => {
    if (!cfg.enabled || !cfg.config) return;
    firebase.initializeApp(cfg.config);
    firebase.messaging().onBackgroundMessage((payload) => {
      const n = payload.notification || {};
      self.registration.showNotification(n.title || 'Gawali', {
        body: n.body || '',
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        data: { link: (payload.data && payload.data.link) || '/' },
      });
    });
  })
  .catch(() => undefined);
