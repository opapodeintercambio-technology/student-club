// Estado GLOBAL de mute do feed (videos + posts com musica).
//
// Regra: 1 mute = todos mutam, 1 desmute = todos voltam a tocar. Sem
// isso o user tinha que mutar/desmutar individualmente cada video/post
// (cansativo e dava som duplicado quando 2 estavam visiveis).
//
// Tambem usado por Stories: quando o viewer abre, dispara setFeedMuted(true)
// pra parar qualquer audio do feed enquanto o user navega stories.

let globalMuted = false;
const listeners: Set<(muted: boolean) => void> = new Set();

export function getFeedMuted(): boolean {
  return globalMuted;
}

export function setFeedMuted(muted: boolean): void {
  if (globalMuted === muted) return;
  globalMuted = muted;
  listeners.forEach(cb => { try { cb(muted); } catch {} });
}

export function subscribeFeedMuted(cb: (muted: boolean) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
