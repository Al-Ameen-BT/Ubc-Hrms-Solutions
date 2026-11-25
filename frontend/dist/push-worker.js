self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { payload = { body: event.data?.text() || 'You have a new notification.' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'UCB-HRMS', {
    body: payload.body || 'You have a new notification.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { url: payload.url || '/#/notifications' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windows => {
    const target = event.notification.data?.url || '/#/notifications';
    const existing = windows.find(client => 'focus' in client);
    if (existing) { existing.navigate(target); return existing.focus(); }
    return clients.openWindow(target);
  }));
});
