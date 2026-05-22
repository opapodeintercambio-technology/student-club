// Service Worker Student Club — Web Push
// Bump na versão pra forçar reinstalação quando alterado
const SW_VERSION = 'studentclub-sw-v163';

self.addEventListener('install', (event) => {
  // Ativa imediatamente sem esperar tabs antigas fecharem
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Toma controle de todas as tabs abertas imediatamente
  event.waitUntil(self.clients.claim());
});

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
