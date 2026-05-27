// Tracker global do video YouTube atualmente ATIVO (em foco / com audio).
//
// Problema: IntersectionObserver com threshold 0.5 fazia TODOS os videos
// 50%+ visiveis tocarem ao mesmo tempo. Resultado: dois audios sobrepostos
// ao scrollar entre dois videos.
//
// Solucao: cada player se registra e reporta seu intersection ratio.
// O tracker elege o video com MAIOR ratio (mais visivel) como ativo;
// todos os outros pausam. Quando o user scrolla, o ativo muda fluidamente
// — sempre 1 unico video tocando.

interface VideoEntry {
  id: string;
  ratio: number;
  play: () => void;
  pause: () => void;
}

const entries = new Map<string, VideoEntry>();
let activeId: string | null = null;

function recompute() {
  let bestId: string | null = null;
  let bestRatio = 0.5; // threshold minimo pra ser considerado "ativo"
  for (const e of entries.values()) {
    if (e.ratio > bestRatio) {
      bestRatio = e.ratio;
      bestId = e.id;
    }
  }
  if (bestId === activeId) return;
  // Pausa o anterior
  if (activeId) {
    const prev = entries.get(activeId);
    try { prev?.pause(); } catch {}
  }
  activeId = bestId;
  // Toca o novo
  if (activeId) {
    const next = entries.get(activeId);
    try { next?.play(); } catch {}
  }
}

export function registerActiveVideo(id: string, play: () => void, pause: () => void): void {
  entries.set(id, { id, ratio: 0, play, pause });
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
