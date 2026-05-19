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

// Detecta mobile via user agent + pointer:coarse. Sons só tocam em mobile —
// no desktop seriam intrusivos durante uso longo de teclado físico.
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const uaMobile = /iPhone|iPad|iPod|Android/i.test(ua);
  const pointerCoarse = window.matchMedia?.('(pointer: coarse)')?.matches;
  return uaMobile || !!pointerCoarse;
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

// Som de digitação — "tick" suave e aberto.
// Mudança vs. versão anterior:
//   - Frequências MAIS ALTAS (centro 1200Hz em vez de 95Hz) → menos grave
//   - Low-pass aberto em 5000Hz (era 1900Hz) → mais "ar", som não fica abafado
//   - Grave eliminado (não há mais "thock" dominante)
//   - Brilho aumentado em harmônicos médios-agudos
//   - Curva de attack mais suave (1.5ms em vez de 0.5ms) → sem "estalo"
export function playTypingSound() {
  if (!isMobileDevice()) return;
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;

  // Low-pass alto pra deixar o som "aberto" sem ser estridente
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5000;
  lp.Q.value = 0.5;

  // === 1) Corpo médio (principal) — sine 1200→600Hz em 8ms ===
  const oscMain = ctx.createOscillator();
  const gMain = ctx.createGain();
  oscMain.type = 'sine';
  oscMain.frequency.setValueAtTime(1200 + Math.random() * 100, now);
  oscMain.frequency.exponentialRampToValueAtTime(600, now + 0.008);
  gMain.gain.setValueAtTime(0, now);
  gMain.gain.linearRampToValueAtTime(0.18, now + 0.0015); // attack mais suave
  gMain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
  oscMain.connect(gMain).connect(lp);
  oscMain.start(now);
  oscMain.stop(now + 0.04);

  // === 2) Brilho agudo — triangle 2400→1500Hz em 6ms ===
  const oscHi = ctx.createOscillator();
  const gHi = ctx.createGain();
  oscHi.type = 'triangle';
  oscHi.frequency.setValueAtTime(2400 + Math.random() * 200, now);
  oscHi.frequency.exponentialRampToValueAtTime(1500, now + 0.006);
  gHi.gain.setValueAtTime(0, now);
  gHi.gain.linearRampToValueAtTime(0.08, now + 0.001);
  gHi.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);
  oscHi.connect(gHi).connect(lp);
  oscHi.start(now);
  oscHi.stop(now + 0.02);

  lp.connect(ctx.destination);
}

// Som de apagar (backspace) — mais grave que o typing, sinaliza "remoção".
// Mesma receita de noise filtrado, mas em frequência mais baixa.
export function playEraseSound() {
  if (!isMobileDevice()) return;
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

// Som de envio de mensagem — "swoosh" curto ascendente.
// Toca em mobile E desktop (não passa pelo isMobileDevice check).
// Receita: dois osciladores sine subindo de 600→1400Hz em 100ms,
// com pequeno detuning entre eles pra dar "corpo" estéreo natural.
export function playSendSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;

  const makeSwoosh = (startFreq: number, endFreq: number, vol: number, dur: number) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  };
  makeSwoosh(600, 1400, 0.20, 0.11);
  makeSwoosh(900, 2000, 0.10, 0.09); // segunda voz mais aguda, sutil
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
