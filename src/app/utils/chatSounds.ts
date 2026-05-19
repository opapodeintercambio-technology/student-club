// Sons sintetizados via Web Audio API — sem nenhum asset externo.
// Não copiam nenhum app conhecido: timbres e envelopes desenhados aqui.

let ctxSingleton: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctxSingleton && ctxSingleton.state !== 'closed') return ctxSingleton;
  try {
    const Ctor: typeof AudioContext = (window.AudioContext || (window as any).webkitAudioContext) as any;
    if (!Ctor) return null;
    ctxSingleton = new Ctor();
    return ctxSingleton;
  } catch {
    return null;
  }
}

// iOS Safari/PWA: AudioContext começa suspended até o primeiro gesto do user.
// Chamamos resume() em cada som; gestos do user (keydown/click) já contam.
async function ensureRunning(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch {}
  }
}

// Som de digitação — sutil, frequência alta tipo "tick" curto.
// Diferente do iPhone clássico (que é uma amostra real), nosso é uma onda
// triangular curtíssima (10ms) em 1700Hz com pequena variação aleatória.
export function playTypingSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'triangle';
  // Pequena variação na frequência pra não soar metálico repetido
  const freq = 1650 + Math.random() * 200;
  osc.frequency.setValueAtTime(freq, now);
  // Envelope ultra-curto: attack 1ms, decay 12ms, volume baixíssimo
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.05, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.013);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.02);
}

// Som de início de gravação — dois beeps curtos ascendentes (whoop sutil).
// Sinaliza "começou a gravar" sem ser intrusivo. Diferente do WhatsApp
// (que faz um swoosh longo).
export function playRecordStartSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;
  const playBeep = (startOffset: number, freq: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now + startOffset);
    gain.gain.setValueAtTime(0, now + startOffset);
    gain.gain.linearRampToValueAtTime(0.18, now + startOffset + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + startOffset);
    osc.stop(now + startOffset + 0.1);
  };
  playBeep(0,      720);   // primeiro beep mais grave
  playBeep(0.07,   1080);  // segundo beep mais agudo — sensação de "start"
}

// Som de cancelamento — descendente rápido, sinaliza "abortado".
export function playRecordCancelSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(280, now + 0.15);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.2);
}
