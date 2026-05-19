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

// Som de digitação — emula o "tick" do teclado iOS.
// Receita: noise burst muito curto + band-pass agudo + envelope explosivo.
// Soa "plástico" / "click" em vez de bip eletrônico (que era o anterior).
export function playTypingSound() {
  const ctx = getCtx();
  if (!ctx) return;
  ensureRunning(ctx);
  const now = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer(ctx);
  // Band-pass em ~3.5kHz com Q alto: deixa o noise com "cor" aguda tipo click
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  // Variação pequena pra não soar identicamente metálico em sequência
  bp.frequency.value = 3300 + Math.random() * 600;
  bp.Q.value = 6;
  // High-pass extra pra cortar graves residuais
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const gain = ctx.createGain();
  // Envelope explosivo: attack 0.5ms → decay 22ms (curto mas perceptível)
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.22, now + 0.0008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
  src.connect(bp).connect(hp).connect(gain).connect(ctx.destination);
  src.start(now);
  src.stop(now + 0.05);
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
