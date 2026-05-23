// Service Worker Student Club — Web Push + cache-first pro app shell
//
// Bump na versão pra forçar reinstalação quando alterado.
//
// ─── ESTRATEGIA DE CACHE ─────────────────────────────────────────────
//   Antes: SW so lidava com push. Cada reload baixava ~1.8MB de bundle.
//   Agora: cache local com 2 politicas distintas:
//
//   1) /assets/* (hashed pelo Vite) → CACHE-FIRST eterno.
//      Vite gera nomes como `index-BxwqXXbj.js` onde o hash muda toda vez
//      que o conteudo muda. Logo, dado uma URL especifica, o conteudo
//      jamais muda. Podemos servir do cache pra SEMPRE → zero round-trip
//      em reloads. Falha de rede tambem cai pro cache → app abre offline.
//
//   2) HTML (navegacao raiz '/') → STALE-WHILE-REVALIDATE.
//      Serve a versao cacheada IMEDIATAMENTE (instantaneo!) e busca
//      atualizacao em background. Proxima visita ja pega o HTML novo,
//      que aponta pros bundles novos hashed.
//
//   3) /api/, supabase, fonts.googleapis → NETWORK-ONLY (sem cache).
//
const SW_VERSION = 'studentclub-sw-v235';
const CACHE_NAME = `studentclub-${SW_VERSION}`;

// App shell minimo — pre-cacheado no install pra garantir abertura offline.
// O HTML eh cacheado dinamicamente no primeiro fetch (mais robusto que
// listar paths estaticos que podem mudar).
const APP_SHELL = [
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar tabs antigas fecharem
  self.skipWaiting();
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      // Best-effort: ignora individuals que falharem (recurso movido, etc.)
      await Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(() => {})
      ));
    } catch {}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpa caches antigos (versoes anteriores do SW)
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(n => n.startsWith('studentclub-') && n !== CACHE_NAME)
          .map(n => caches.delete(n))
      );
    } catch {}
    // Toma controle de todas as tabs abertas imediatamente
    await self.clients.claim();
  })());
});

// ─── FETCH HANDLER ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Apenas same-origin entra no cache. Supabase, fonts.googleapis, etc.
  // continuam network-only (sem interceptacao).
  if (url.origin !== self.location.origin) return;

  // 1) /assets/* (hashed) → cache-first eterno
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) {
          // put eh async mas nao precisa esperar — devolve a resposta agora
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // Falha de rede + nao cacheado: deixa o browser lidar
        return fetch(req);
      }
    })());
    return;
  }

  // 2) HTML (navegacao) → stale-while-revalidate
  //    Serve o cache instantaneamente, atualiza em background.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match('/');
        // Fetch em paralelo pra atualizar o cache
        const fetchPromise = fetch(req)
          .then(res => {
            if (res && res.ok) cache.put('/', res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        // Se temos cache, devolve INSTANTANEO; senao espera o fetch.
        return cached || (await fetchPromise) || new Response('Offline', { status: 503 });
      } catch {
        return fetch(req);
      }
    })());
    return;
  }

  // 3) Outros recursos same-origin (imagens estaticas em /public, etc.):
  //    cache-first (sao raros e raramente mudam)
  if (url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|webmanifest)$/i)) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone()).catch(() => {});
        return res;
      } catch {
        return fetch(req);
      }
    })());
  }
});

// ─── PUSH NOTIFICATIONS (inalterado) ─────────────────────────────────
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try { data = event.data.json(); }
    catch { try { data = { body: event.data.text() }; } catch {} }
  }

  const title = data.title || 'Student Club';
  const body = data.body || 'Nova mensagem';
  const tag = data.tag || `chat-${Date.now()}`;
  const url = data.url || '/';
  // Tag 'nudge-...' = cutucada -> vibracao mais forte (estilo MSN)
  const isNudge = typeof tag === 'string' && tag.startsWith('nudge-');
  const vibratePattern = isNudge
    ? [120, 60, 120, 60, 200, 60, 120]
    : [200, 100, 200];

  event.waitUntil((async () => {
    // Avisa todas as abas abertas que chegou um push (foreground).
    // Tipo renomeado pra PUSH_RECEIVED — antes era PLAY_TROKIII que disparava
    // a vinheta antiga. Hoje só cutucadas (tag 'nudge-*') geram efeito.
    try {
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clientsList.forEach((client) => {
        try { client.postMessage({ type: 'PUSH_RECEIVED', title, body, tag }); } catch {}
      });
    } catch {}

    // Sempre mostra a notificação do sistema (foreground ou background)
    await self.registration.showNotification(title, {
      body,
      icon: '/logo.png',
      badge: '/logo.png',
      tag,
      renotify: true,
      // Cutucada exige interacao do user pra fechar (estilo MSN, nao some sozinha)
      requireInteraction: isNudge,
      silent: false,
      vibrate: vibratePattern,
      // Em PWA Android, prioridade max -> vibra mesmo em DnD
      ...(isNudge ? { urgency: 'high' } : {}),
      data: { url, tag },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // Se já há uma aba do Student Club, foca nela
    for (const client of list) {
      try {
        if ((client.url.includes('trokvibe') || client.url.includes('localhost')) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client && targetUrl !== '/') {
            try { await client.navigate(targetUrl); } catch {}
          }
          return;
        }
      } catch {}
    }
    // Se não, abre nova
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

// pushsubscriptionchange: re-subscribe quando o browser invalida a subscription
self.addEventListener('pushsubscriptionchange', (event) => {
  // O cliente vai detectar via getSubscription() e re-registrar
  // Aqui apenas notificamos para tentativa de re-subscribe
  event.waitUntil((async () => {
    try {
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
      clientsList.forEach((client) => {
        try { client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }); } catch {}
      });
    } catch {}
  })());
});
