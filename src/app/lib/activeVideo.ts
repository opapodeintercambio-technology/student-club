// Tracker global do video YouTube atualmente ATIVO (em foco / com audio).
//
// Modelo:
//   - TODOS os players carregam tocando MUDO (autoplay: 1, mute: 1).
//     Isso evita o logo central do YouTube e nao precisa de gesto do user.
//   - Quando um se torna o "mais visivel" (maior ratio do IntersectionObserver),
//     o tracker o ATIVA: chama onActivate (toca + desmuta se feedMuted=false).
//   - Os outros DESATIVAM: onDeactivate (pausa + muta) — economiza banda e
//     evita 2 audios sobrepostos.
//   - Threshold minimo 0.5: nao ativa se nenhum estiver com >=50% visivel
//     (ex: usuario entre 2 cards). Nesse caso todos ficam pausados.

interface VideoEntry {
  id: string;
  ratio: number;
  activate: () => void;
  deactivate: () => void;
}

const entries = new Map<string, VideoEntry>();
let activeId: string | null = null;

function recompute() {
  let bestId: string | null = null;
  let bestRatio = 0.5;
  for (const e of entries.values()) {
    if (e.ratio > bestRatio) {
      bestRatio = e.ratio;
      bestId = e.id;
    }
  }
  if (bestId === activeId) return;
  // Desativa o anterior (pausa + muta)
  if (activeId) {
    const prev = entries.get(activeId);
    try { prev?.deactivate(); } catch {}
  }
  activeId = bestId;
  // Ativa o novo (toca + desmuta)
  if (activeId) {
    const next = entries.get(activeId);
    try { next?.activate(); } catch {}
  }
}

export function registerActiveVideo(
  id: string,
  activate: () => void,
  deactivate: () => void,
): void {
  entries.set(id, { id, ratio: 0, activate, deactivate });
}

export function unregisterActiveVideo(id: string): void {
  entries.delete(id);
  if (activeId === id) {
    activeId = null;
    recompute();
  }
}

export function reportActiveVideoRatio(id: string, ratio: number): void {
  const e = entries.get(id);
  if (!e) return;
  e.ratio = ratio;
  recompute();
}

export function getActiveVideoId(): string | null {
  return activeId;
}
