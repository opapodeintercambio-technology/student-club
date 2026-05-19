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

// Pequeno buffer de noise reutilizado pelos sons "plásticos"
let noiseBuffer: AudioBuffer | null = null;
function getNoiseBuffer(ctx: AudioContext): AudioBuffer {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.25);
  const buf = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

// Som de digitação — estilo "thock" suave de teclado mecânico/Samsung One UI.
// Sem noise burst (gerava "tssss" eletrônico). Apenas dois osciladores
// senoidais com pitch envelope rápido — soa mais natural e menos sintético.
//   1) Impulso BAIXO (300→100Hz em 4ms): corpo "tock"
//   2) Impulso MÉDIO (900→400Hz em 6ms): brilho do contato
// Low-pass agressivo em 2kHz corta qualquer harmônico estridente residual.
export function playTypingSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;

  // Low-pass shared — corta agudos pra parecer "natural", não eletrônico
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1900;
  lp.Q.value = 0.7;

  // === 1) Corpo grave (tock) ===
  const oscLow = ctx.createOscillator();
  const gLow = ctx.createGain();
  oscLow.type = 'sine';
  oscLow.frequency.setValueAtTime(280 + Math.random() * 40, now);
  oscLow.frequency.exponentialRampToValueAtTime(95, now + 0.005);
  gLow.gain.setValueAtTime(0, now);
  gLow.gain.linearRampToValueAtTime(0.32, now + 0.0008);
  gLow.gain.exponentialRampToValueAtTime(0.0001, now + 0.038);
  oscLow.connect(gLow).connect(lp);
  oscLow.start(now);
  oscLow.stop(now + 0.04);

  // === 2) Brilho do contato (médio agudo, mas filtrado) ===
  const oscMid = ctx.createOscillator();
  const gMid = ctx.createGain();
  oscMid.type = 'triangle'; // triangle = harmônicos suaves, sem agressividade
  oscMid.frequency.setValueAtTime(950 + Math.random() * 120, now);
  oscMid.frequency.exponentialRampToValueAtTime(420, now + 0.007);
  gMid.gain.setValueAtTime(0, now);
  gMid.gain.linearRampToValueAtTime(0.12, now + 0.0006);
  gMid.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
  oscMid.connect(gMid).connect(lp);
  oscMid.start(now);
  oscMid.stop(now + 0.025);

  lp.connect(ctx.destination);
}

// Som de apagar (backspace) — mais grave que o typing, sinaliza "remoção".
// Mesma receita de noise filtrado, mas em frequência mais baixa.
export function playEraseSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 + Math.random() * 200;
  bp.Q.value = 5;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.20, now + 0.001);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);
  src.connect(bp).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + 0.06);
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
