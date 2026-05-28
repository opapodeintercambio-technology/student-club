// Flag global "app esta ocupado com operacao critica" — usado pra
// prevenir reload automatico no meio de fluxos que o user nao quer
// perder (post de story em andamento, etc).
//
// Por que global em vez de Context? Checks acontecem dentro de
// setInterval/event handlers fora do React render cycle. Lendo do
// window eh simples e funciona no momento exato do check.

const BUSY_KEY = '__papoBusy';
const PENDING_RELOAD_KEY = '__papoPendingReload';

export function setAppBusy(busy: boolean): void {
  if (typeof window === 'undefined') return;
  if (busy) {
    (window as any)[BUSY_KEY] = true;
  } else {
    delete (window as any)[BUSY_KEY];
    // Se havia reload pendente (bloqueado por busy), executa agora.
    // Garante que apos o post terminar, o app pega a versao nova /
    // recupera de chunk load error.
    if ((window as any)[PENDING_RELOAD_KEY]) {
      delete (window as any)[PENDING_RELOAD_KEY];
      // setTimeout pra dar tempo do React commitar UI pos-busy antes
      // de descmontar tudo pro reload.
      setTimeout(() => window.location.reload(), 200);
    }
  }
}

export function isAppBusy(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any)[BUSY_KEY] === true;
}

/**
 * Pede pra recarregar a pagina. Se a app esta ocupada (isAppBusy),
 * ADIA o reload — sera executado automaticamente quando setAppBusy(false)
 * for chamado. Caso contrario, recarrega imediato.
 *
 * Usado por:
 *   - useAutoUpdate (deploy novo detectado)
 *   - main.tsx (chunk load error)
 *   - ErrorBoundary (chunk load error)
 *
 * Tudo isso causava o composer de story fechar no meio do upload
 * quando o app recarregava — user reportou "volta pra pagina principal
 * inesperadamente" durante post.
 */
export function requestReloadOrDefer(): void {
  if (typeof window === 'undefined') return;
  if (isAppBusy()) {
    (window as any)[PENDING_RELOAD_KEY] = true;
    return;
  }
  window.location.reload();
}
