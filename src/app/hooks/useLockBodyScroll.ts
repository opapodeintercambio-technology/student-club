import { useEffect, useId } from 'react';

// Trava o scroll da página atrás de um modal/overlay enquanto o componente
// estiver montado. Funciona em desktop e em mobile (iOS Safari + Android Chrome).
//
// Estratégia (importante):
//   Usa `overflow:hidden` no <html> e <body> + `overscroll-behavior:none`,
//   que trava o scroll SEM mudar a posição do body (a URL bar do Safari fica
//   onde estava e os fixed-bottom não se mexem).
//
// Implementação BULLETPROOF:
//   Versão anterior usava um `lockCount` (contador). Se uma cleanup falhasse
//   ou um setup duplicasse (Strict Mode, hot reload, exceção), o contador
//   ficava desincronizado e o scroll travava pra sempre — user precisava
//   recarregar a pagina pra desbloquear (bug reportado).
//
//   Agora usa um Set de TOKENS unicos por instancia do hook. Cada componente
//   adiciona seu token no mount e remove no unmount. Lock fica ativo
//   enquanto o Set tiver pelo menos 1 token. Cleanup sempre converge:
//   mesmo se uma cleanup for chamada DUAS vezes (Strict Mode), o set.delete
//   eh idempotente (segunda chamada nao faz nada).

const activeTokens = new Set<string>();
let savedStyles: {
  htmlOverflow: string;
  htmlOverscroll: string;
  bodyOverflow: string;
  bodyOverscroll: string;
} | null = null;

function applyLock() {
  if (savedStyles) return; // ja travado
  const html = document.documentElement;
  const body = document.body;
  savedStyles = {
    htmlOverflow: html.style.overflow,
    htmlOverscroll: (html.style as any).overscrollBehavior || '',
    bodyOverflow: body.style.overflow,
    bodyOverscroll: (body.style as any).overscrollBehavior || '',
  };
  html.style.overflow = 'hidden';
  (html.style as any).overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  (body.style as any).overscrollBehavior = 'none';
}

function releaseLock() {
  if (!savedStyles) return; // ja liberado
  const html = document.documentElement;
  const body = document.body;
  html.style.overflow = savedStyles.htmlOverflow;
  (html.style as any).overscrollBehavior = savedStyles.htmlOverscroll;
  body.style.overflow = savedStyles.bodyOverflow;
  (body.style as any).overscrollBehavior = savedStyles.bodyOverscroll;
  savedStyles = null;
}

export function useLockBodyScroll(active = true) {
  const token = useId(); // id estavel por instancia (React 18+)
  useEffect(() => {
    if (!active) return;
    activeTokens.add(token);
    applyLock();
    return () => {
      activeTokens.delete(token);
      if (activeTokens.size === 0) releaseLock();
    };
  }, [active, token]);
}

// Escape hatch: util pra debug e pra desbloquear forcadamente caso algum
// componente esqueca de fazer cleanup. Pode ser chamado do console ou de
// um listener global (ex.: ao trocar de aba, ao fechar drawer principal).
if (typeof window !== 'undefined') {
  (window as any).__papoForceUnlockScroll = () => {
    activeTokens.clear();
    releaseLock();
  };
}
