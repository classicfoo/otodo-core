const CACHE_NAME = 'otodo-shell-v2';
const ASSETS = [
  '/',
  '/index.php',
  '/task.php',
  '/login.php',
  '/register.php',
  '/assets/styles.css',
  '/assets/app.js',
  '/assets/auth_offline.js',
  '/assets/db_local.js',
  '/assets/sync.js',
  '/assets/dates.js',
  '/assets/task.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (url.pathname.startsWith('/api.php')) {
    return;
  }

  if (request.method === 'POST' && url.pathname === '/login.php') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedLogin = await caches.match('/login.php');
        if (cachedLogin) {
          const loginHtml = await cachedLogin.text();
          const banner = `
            <div class="alert alert-warning" role="alert" style="margin-bottom: 1rem;">
              You're offline right now. Use the offline login form to continue.
            </div>
          `;
          const updatedHtml = loginHtml.replace(
            /<main([^>]*)>/i,
            `<main$1>${banner}`,
          );
          return new Response(updatedHtml, {
            headers: { 'Content-Type': 'text/html; charset=UTF-8' },
          });
        }
        return new Response(
          `<!doctype html><html lang="en"><head><meta charset="UTF-8"><title>Offline login</title></head><body><main><h1>You're offline</h1><p>Please open the login page to use the offline sign-in flow.</p><a href="/login.php">Go to login</a></main></body></html>`,
          { headers: { 'Content-Type': 'text/html; charset=UTF-8' } },
        );
      }),
    );
    return;
  }

  if (request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, cloned));
          return response;
        })
        .catch(() => {
          if (request.mode === 'navigate') {
            if (url.pathname === '/login.php' || url.pathname === '/register.php') {
              return caches.match(url.pathname);
            }
            if (url.pathname.startsWith('/task.php')) {
              return caches.match('/task.php');
            }
          }
          return caches.match('/index.php');
        });
    })
  );
});
