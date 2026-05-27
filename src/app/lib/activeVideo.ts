// Tracker global do video YouTube atualmente ATIVO (com audio).
//
// Modelo:
//   - TODOS os players ficam tocando o tempo todo, em LOOP, mudos.
//     User pediu video sem pausa e sem "Watch Again" (loop infinito).
//   - O tracker so controla MUTE: o video mais visivel desmuta, os
//     outros mutam. Ninguem pausa — assim nao aparece o icone de play
//     central do YouTube nem a tela de fim de video.
//   - Threshold minimo 0.5: nao ativa se nenhum estiver com >=50% visivel.

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
