// useAutoUpdate — detecta novo build em produção e recarrega o app
// automaticamente. Resolve o pesadelo de cache do PWA / service worker.
//
// Estratégia:
//   1. Polling leve a cada 60s: fetch /index.html?_t=now no-cache.
//      Extrai o hash do bundle JS principal (vite:assets/index-XXXX.js).
//      Se mudou em relação ao que está rodando, recarrega.
//   2. Quando volta de background (visibilitychange → visible) checa imediato.
//   3. Service worker: ouve 'controllerchange' — quando o SW novo toma
//      controle, recarrega também.
//
// Por que duas estratégias? Em alguns iOS PWA o controllerchange não
// dispara confiável. O polling é o backup garantido.

import { useEffect } from 'react';
import { requestReloadOrDefer } from '../utils/appBusy';

const CHECK_INTERVAL_MS = 60_000; // 1min

function extractBundleHash(html: string): string | null {
  // Vite gera <script type="module" crossorigin src="/assets/index-XXXXX.js">
  const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
  return m ? m[1] : null;
}

export function useAutoUpdate() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hostname === 'localhost') return; // só em prod

    let currentHash: string | null = null;
    let cancelled = false;

    // Pega o hash atual da página em execução
    try {
      const tag = document.querySelector('script[src*="assets/index-"]') as HTMLScriptElement | null;
      if (tag) {
        const m = tag.src.match(/assets\/index-([A-Za-z0-9_-]+)\.js/);
        if (m) currentHash = m[1];
      }
    } catch {}

    async function check() {
      if (cancelled || !currentHash) return;
      try {
        const res = await fetch('/?_t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const html = await res.text();
        const newHash = extractBundleHash(html);
        if (newHash && newHash !== currentHash) {
          // Versão nova publicada — pede reload (adiado se app busy).
          // Evita reload mid-typing: só se nenhum input está focado.
          const active = document.activeElement;
          const isTyping = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || (active as HTMLElement).isContentEditable);
          if (isTyping) return;
          // requestReloadOrDefer: se app esta ocupado (ex: postando story)
          // o reload eh ADIADO e executado quando setAppBusy(false) for
          // chamado. Garante que o user nao perde o post no meio do upload.
          requestReloadOrDefer();
        }
      } catch {}
    }

    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisible);

    // SW controllerchange — caminho rápido quando funciona
    let onCtrlChange: (() => void) | null = null;
    if ('serviceWorker' in navigator) {
      onCtrlChange = () => {
        // Se ainda há SW velho, espera 1s e recarrega (adiado se busy).
        setTimeout(() => requestReloadOrDefer(), 1000);
      };
      navigator.serviceWorker.addEventListener('controllerchange', onCtrlChange);
      // Força check de update no SW periodicamente
      const swInterval = window.setInterval(async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) reg.update().catch(() => {});
        } catch {}
      }, CHECK_INTERVAL_MS);
      return () => {
        cancelled = true;
        clearInterval(interval);
        clearInterval(swInterval);
        document.removeEventListener('visibilitychange', onVisible);
        if (onCtrlChange) navigator.serviceWorker.removeEventListener('controllerchange', onCtrlChange);
      };
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
