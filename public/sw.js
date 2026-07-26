// ZeroClaw Web Chat - Service Worker
// PWA 支持，缓存静态资源

const CACHE_NAME = 'claw-agent-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/chat.js',
  '/manifest.json'
];

// 安装事件 - 缓存静态资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => caches.delete(name))
        );
      })
      .then(() => self.clients.claim())
  );
});

// 请求事件 - 网络优先，离线回退缓存
// 不能用缓存优先：HTML/CSS/JS 更新后用户会长期停留在旧版本
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 跳过非 http/https 请求（如 chrome-extension）
  if (!request.url.startsWith('http://') && !request.url.startsWith('https://')) {
    return;
  }

  // 跳过 API 请求和 WebSocket
  if (request.url.includes('/api/') || request.url.includes('/ws/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        // 拿到新版本就写回缓存，供离线时使用
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(request, responseClone));
        }
        return response;
      })
      .catch(() => {
        // 离线：回退到缓存，文档请求兜底到首页
        return caches.match(request)
          .then(cached => {
            if (cached) return cached;
            if (request.destination === 'document') {
              return caches.match('/index.html');
            }
          });
      })
  );
});

// 推送通知事件
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  const title = data.title || 'Claw Agent';
  const options = {
    body: data.body || '收到新消息',
    icon: '/favicon/apple-touch-icon.png',
    badge: '/favicon/favicon-32x32.png',
    data: data.url || '/'
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 通知点击事件
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        // 如果已有窗口，聚焦它
        for (const client of clientList) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus();
          }
        }
        // 否则打开新窗口
        return clients.openWindow(event.notification.data);
      })
  );
});
