/* Solo notifiche push. Nessuna cache di pagine, API, token o dati cliente. */
self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data ? event.data.json() : {}; } catch { /* payload non valido */ }
  const title = typeof message.title === 'string' ? message.title : 'Scaramuzzo';
  const body = typeof message.body === 'string' ? message.body : 'Hai un promemoria appuntamento.';
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/app-clienti/icon-192.png',
    badge: '/app-clienti/favicon.png',
    tag: typeof message.tag === 'string' && /^scaramuzzo-appointment-\d+$/.test(message.tag)
      ? message.tag : 'scaramuzzo-appointment-reminder',
    data: { url: '/app-clienti/bookings' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL('/app-clienti/bookings', self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const current = windows.find((client) => client.url.startsWith(self.location.origin + '/app-clienti/'));
    if (current) {
      await current.navigate(url);
      return current.focus();
    }
    return self.clients.openWindow(url);
  })());
});
