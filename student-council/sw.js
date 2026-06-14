importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const CACHE_NAME = 'student-council-v1';
const ASSETS = [
  '/student-council/',
  '/student-council/index.html',
  '/student-council/dashboard.html',
  '/student-council/admin.html',
  '/student-council/css/main.css',
  '/student-council/js/config.js',
  '/student-council/js/auth.js',
  '/student-council/js/dashboard.js',
  '/student-council/js/admin.js',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// Firebase Messaging background handler
// Will be initialized when config is loaded
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'FIREBASE_CONFIG') {
    firebase.initializeApp(e.data.config);
    const messaging = firebase.messaging();
    messaging.onBackgroundMessage(payload => {
      self.registration.showNotification(payload.notification.title, {
        body: payload.notification.body,
        icon: '/student-council/icons/icon-192.png',
        badge: '/student-council/icons/icon-192.png',
        data: payload.data,
      });
    });
  }
});
