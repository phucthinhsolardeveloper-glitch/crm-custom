/* VeloCRM Service Worker - nhan Web Push ca khi tab web da dong. */

// 1) Nhan push tu server -> hien thong bao len man hinh
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { title: 'VeloCRM', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'VeloCRM';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png', // logo hien kem thong bao
    badge: '/icon-192.png', // icon nho tren thanh trang thai (Android)
    data: { url: data.url || '/' }, // luu link de bam vao mo dung trang
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 2) Bam vao thong bao -> focus tab dang mo (neu co) hoac mo tab moi dung trang
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
