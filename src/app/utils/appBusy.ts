// Flag global "app esta ocupado com operacao critica" — usado pra
// prevenir reload automatico (useAutoUpdate) no meio de fluxos que o
// user nao quer perder. Hoje:
//   - publishComposer de story (Stories.tsx)
// Pode ser expandido pra: postagem de feed, envio de mensagem chat,
// upload de audio/video, etc.
//
// Por que global em vez de Context? useAutoUpdate roda em um useEffect
// de App.tsx (top-level), e o check ocorre dentro de um setInterval
// fora do React render cycle. Lendo do window eh simples e funciona
// no momento exato do check.

const BUSY_KEY = '__papoBusy';

export function setAppBusy(busy: boolean): void {
  if (typeof window === 'undefined') return;
  if (busy) (window as any)[BUSY_KEY] = true;
  else delete (window as any)[BUSY_KEY];
}

export function isAppBusy(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any)[BUSY_KEY] === true;
}
