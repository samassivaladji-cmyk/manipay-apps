// Service Worker Firebase Messaging — AFRIM PAY v2
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCtWT_Z6VznIIgM5mOp_Ikt-aTyrm5JGyY",
  authDomain: "afrim-pay.firebaseapp.com",
  projectId: "afrim-pay",
  storageBucket: "afrim-pay.firebasestorage.app",
  messagingSenderId: "20456105449",
  appId: "1:20456105449:web:7cd703cf77924420621778"
});

const messaging = firebase.messaging();

// Notification reçue en arrière-plan (écran verrouillé ou autre onglet)
messaging.onBackgroundMessage(function(payload) {
  const notification = payload.notification || {};
  const title = notification.title || 'AFRIM PAY';
  const body = notification.body || '';
  
  return self.registration.showNotification(title, {
    body: body,
    icon: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png',
    badge: 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/logo.png',
    vibrate: [200, 100, 200],
    tag: 'afrim-pay-notif',
    renotify: true,
    data: payload.data || {}
  });
});

// Clic sur notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  const url = 'https://samassivaladji-cmyk.github.io/afrim-pay-apps/afrim-client.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var c of list) {
        if (c.url.includes('afrim-pay-apps') && 'focus' in c) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});
