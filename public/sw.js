// Service Worker Student Club — Web Push + cache pro app shell
//
// HISTORICO DO BUG CRITICO (v278):
//   v275-v277 usavam STALE-WHILE-REVALIDATE no HTML — servia cache antigo
//   e atualizava em background. PROBLEMA: o HTML antigo apontava pra
//   chunks Vite (/assets/index-OLD_HASH.js + lazy chunks tipo ChatPanel-*.js)
//   que foram REMOVIDOS do servidor apos deploys subsequentes. Cache tinha
//   3 versoes diferentes do index.js empilhadas (CvsSBQ_F, DSZlq6wK,
//   CUYQ5Guc). Quando o HTML antigo carregava e tentava dynamic import de
//   um chunk antigo nao mais no cache, fetch retornava 404 do Vercel,
//   import() rejeitava, e o ErrorBoundary global capturava — usuario via
//   "Algo deu errado, limpar dados" no desktop E no PWA.
//
// FIX (v278):
//   - HTML agora eh NETWORK-FIRST: tenta rede primeiro, cai pro cache so
//     se offline. Assim o user SEMPRE vê o HTML mais novo (que aponta
//     pros assets mais novos), com fallback offline mantido.
//   - No activate, limpa TUDO de /assets/* do cache anterior (forca
//     re-download dos chunks atuais, evita o cenario "JS antigo + chunks
//     novos misturados").
//   - /assets/* hashed continuam cache-first eterno (sao imutaveis por design).
//
// ─── ESTRATEGIA DE CACHE ─────────────────────────────────────────────
//   1) HTML → NETWORK-FIRST (com 3s timeout pra fallback ao cache).
//      Garante que o user sempre veja a versao mais nova quando online.
//   2) /assets/* (hashed) → CACHE-FIRST eterno. URL contem hash, conteudo
//      jamais muda. Zero round-trip em reloads + funciona offline.
//   3) /api/, supabase, fonts.googleapis → NETWORK-ONLY (sem interceptacao).
//
const SW_VERSION = 'studentclub-sw-v365';
const CACHE_NAME = `studentclub-${SW_VERSION}`;

// App shell minimo — pre-cacheado no install pra garantir abertura offline.
const APP_SHELL = [
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo.png',
];

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar tabs antigas fecharem
  self.skipWaiting();
  event.waitUntil((async () => {
    // NUKE AGRESSIVO no install: deleta TUDO de cache, incluindo o
    // cache do SW v277/v278 que ainda esta tendo chunks orfaos.
    // Sem isso o cliente continuava no loop "Algo deu errado" mesmo
    // apos o deploy do v278 — porque o SW v277 antigo ainda controlava
    // a primeira navegacao com cache podre.
    try {
      const names = await caches.keys();
      await Promise.all(names.map(n => caches.delete(n)));
    } catch {}
    try {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(APP_SHELL.map(url =>
        cache.add(url).catch(() => {})
      ));
    } catch {}
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Garantia adicional: limpa caches que sobreviveram ao install
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
    // BROADCAST RELOAD: avisa todas as tabs (controladas e nao) que ha
    // SW novo. Tabs com JS antigo (que nao tem o listener) ignoram —
    // mas qualquer JS novo vai ouvir e fazer location.reload(). Pra
    // limpar tabs antigas, o SW antigo precisa ser desinstalado primeiro
    // OU o user precisa fechar/abrir o app.
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of clients) {
        try { c.postMessage({ type: 'SW_ACTIVATED', version: '${SW_VERSION}' }); } catch {}
      }
    } catch {}
  })());
});

// Helper: fetch com timeout. Pra HTML, queremos tentar rede mas nao
// bloquear pra sempre se for slow → cai pro cache em 3s.
function fetchWithTimeout(req, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    fetch(req).then(
      res => { clearTimeout(timer); resolve(res); },
      err => { clearTimeout(timer); reject(err); }
    );
  });
}

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
  //    URL contem hash; se o conteudo mudou, a URL mudou. Logo cache
  //    nunca tem stale. Hit no cache → instantaneo + offline.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok) {
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

  // 2) HTML (navegacao) → NETWORK-FIRST com fallback ao cache (offline).
  //    Antes era stale-while-revalidate — servia cache antigo apontando
  //    pra chunks que ja nao existiam mais. Network-first garante que
  //    o user SEMPRE veja a versao mais nova quando online.
  if (req.mode === 'navigate' || req.destination === 'document') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        // Tenta rede com timeout de 3s. Se conseguir, atualiza cache e
        // serve a resposta.
        const res = await fetchWithTimeout(req, 3000);
        if (res && res.ok) {
          cache.put('/', res.clone()).catch(() => {});
        }
        return res;
      } catch {
        // Offline ou timeout — cai pro cache. Se nao tem cache, devolve
        // a resposta offline padrao.
        const cached = await cache.match('/');
        return cached || new Response('Offline', { status: 503 });
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
  const isNudge = String(tag).startsWith('nudge-');

  const opts = {
    body,
    icon: data.icon || '/logo.png',
    badge: data.badge || '/favicon.png',
    image: data.image,
    tag,
    renotify: true,
    requireInteraction: isNudge,
    vibrate: isNudge ? [200, 100, 200, 100, 200, 100, 400] : [80, 40, 120],
    data: { url, ...data.data },
    actions: data.actions,
  };

  event.waitUntil((async () => {
    // Tenta notificar abas abertas pra atualizar UI em tempo real
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        try { client.postMessage({ type: 'PUSH_RECEIVED', data, tag }); } catch {}
      }
    } catch {}

    return self.registration.showNotification(title, opts);
  })());
});

// Click na notificacao → abre/foca a tab com a URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          await client.focus();
          try { client.postMessage({ type: 'NOTIFICATION_CLICK', url }); } catch {}
          return;
        }
      }
      await self.clients.openWindow(url);
    } catch {}
  })());
});

// Re-subscribe quando o push subscription muda (token rotaciona,
// permissao revogada, etc.) — repassa pra app via postMessage.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        try { client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }); } catch {}
      }
    } catch {}
  })());
});

// Suporte a SKIP_WAITING via postMessage — permite app forcar update
// quando detectar um SW novo esperando ativacao.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
