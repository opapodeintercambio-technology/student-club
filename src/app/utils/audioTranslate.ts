// Tradução simultânea de áudio no chat — 100% gratuita, sem APIs pagas.
//
// Pipeline:
//   1) STT (Speech-to-Text) durante a gravação via Web Speech API do browser
//   2) Tradução do transcript via MyMemory API (grátis, 5000 chars/dia/IP)
//   3) TTS (Text-to-Speech) no receptor via SpeechSynthesis API do browser
//
// LIMITAÇÃO: a voz NÃO é a do remetente — é a voz padrão do dispositivo do
// receptor falando o idioma de destino. Pra clonar a voz original do
// remetente é necessário um serviço pago (ex: ElevenLabs Free Tier).
// O hook pra plugar isso depois está no spot marcado com "VOICE_CLONING_HOOK".

// ─── Preferência de idioma de tradução ─────────────────────────────────
// Global (fallback do receptor): idioma que recebe quando outro user manda
// audio sem target_lang explicito.
const LANG_KEY = (u: string) => `papo_chat_translate_lang_${u}`;
// Por conversa (escolha do remetente): idioma pra qual o audio que EU enviar
// nesta conversa deve ser traduzido. Persiste por convId.
const CONV_LANG_KEY = (u: string, convId: string) => `papo_chat_conv_target_${u}_${convId}`;

export function getPreferredTranslateLang(currentUser: string): string {
  try {
    const saved = localStorage.getItem(LANG_KEY(currentUser));
    if (saved) return saved;
  } catch {}
  const nav = navigator.language || 'en-US';
  return nav;
}

export function setPreferredTranslateLang(currentUser: string, lang: string): void {
  try { localStorage.setItem(LANG_KEY(currentUser), lang); } catch {}
}

// Idioma alvo escolhido pelo REMETENTE pra esta conversa. Quando setado,
// todo audio que ele enviar sera traduzido pra esse idioma e o receptor
// vera o texto + ouvira a versao traduzida.
export function getConvTargetLang(currentUser: string, convId: string): string | null {
  try { return localStorage.getItem(CONV_LANG_KEY(currentUser, convId)); }
  catch { return null; }
}

export function setConvTargetLang(currentUser: string, convId: string, lang: string | null): void {
  try {
    if (lang) localStorage.setItem(CONV_LANG_KEY(currentUser, convId), lang);
    else localStorage.removeItem(CONV_LANG_KEY(currentUser, convId));
  } catch {}
}

// Chama o backend (Vercel /api/translate-audio) que usa Groq Whisper-large-v3.
// Setup: cria conta gratis em console.groq.com/keys, adiciona GROQ_API_KEY
// nas env vars do Vercel. Free tier: 14.400 req/dia.
export async function translateAudioServer(
  audioUrl: string,
  targetLang: string,
): Promise<{ transcribed: string; translated: string; srcLang: string } | { error: string }> {
  try {
    const res = await fetch('/api/translate-audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioUrl, targetLang }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data?.error || `HTTP ${res.status}` };
    return data;
  } catch (e: any) {
    return { error: e?.message || 'network error' };
  }
}

// ─── STT durante a gravação (Web Speech API) ───────────────────────────
// Retorna um handle com .stop() que resolve o transcript final.
// Suportado em Chrome, Edge, Safari iOS 14.5+. Em browsers sem suporte,
// retorna null e o áudio é enviado sem transcript.
export interface SpeechRecogHandle {
  stop: () => string;
  cancel: () => void;
}

export function startSpeechRecognition(lang: string = 'pt-BR'): SpeechRecogHandle | null {
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  try {
    const rec = new SpeechRecognition();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    let finalTranscript = '';
    let interimTranscript = '';
    rec.onresult = (event: any) => {
      interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) finalTranscript += text + ' ';
        else interimTranscript += text;
      }
    };
    rec.onerror = () => { /* silencioso — fallback no stop */ };
    rec.start();
    return {
      stop: () => {
        try { rec.stop(); } catch {}
        return (finalTranscript + ' ' + interimTranscript).trim();
      },
      cancel: () => { try { rec.abort(); } catch {} },
    };
  } catch { return null; }
}

// ─── Tradução via MyMemory API (grátis, sem key) ───────────────────────
// Limites: 5000 chars/dia por IP anônimo. Suficiente pra uso normal.
// Doc: https://mymemory.translated.net/doc/spec.php

function shortLang(lang: string): string {
  // Normaliza 'pt-BR' -> 'pt', mas mantém variantes que MyMemory aceita
  return lang.replace('_', '-');
}

export async function translateText(text: string, srcLang: string, dstLang: string): Promise<string> {
  if (!text.trim()) return '';
  if (srcLang === dstLang) return text;
  try {
    const url = new URL('https://api.mymemory.translated.net/get');
    url.searchParams.set('q', text);
    url.searchParams.set('langpair', `${shortLang(srcLang)}|${shortLang(dstLang)}`);
    const res = await fetch(url.toString());
    if (!res.ok) return text;
    const data = await res.json();
    return (data?.responseData?.translatedText as string) || text;
  } catch {
    return text;
  }
}

// ─── TTS via SpeechSynthesis (voz nativa do dispositivo) ───────────────
// VOICE_CLONING_HOOK: pra usar voz do remetente, substituir esta função
// pelo fetch da API de voice cloning (ex: ElevenLabs) e tocar como <audio>.

export function speakInLanguage(text: string, lang: string): void {
  if (!text.trim()) return;
  try {
    // Cancela qualquer fala em andamento
    speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    // Tenta achar uma voz nativa do idioma de destino
    const voices = speechSynthesis.getVoices();
    const match = voices.find(v => v.lang === lang) || voices.find(v => v.lang.startsWith(lang.split('-')[0]));
    if (match) utter.voice = match;
    utter.rate = 1;
    utter.pitch = 1;
    speechSynthesis.speak(utter);
  } catch { /* silencioso — fallback nenhum */ }
}

// Helper: traduz e fala numa só chamada
export async function translateAndSpeak(
  transcript: string,
  srcLang: string,
  dstLang: string,
): Promise<string> {
  const translated = await translateText(transcript, srcLang, dstLang);
  speakInLanguage(translated, dstLang);
  return translated;
}

// ─── Fallback: Whisper no browser via transformers.js ──────────────────
// Usado quando o Web Speech API nao captou nada (ex: iOS PWA, browsers
// sem suporte). Carrega o modelo Whisper-tiny (~75MB) sob demanda, fica
// cacheado depois. Roda 100% no browser, sem servidor nem API key.

let whisperPipelinePromise: Promise<any> | null = null;

async function loadWhisperPipeline() {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = (async () => {
      const transformers = await import('@xenova/transformers');
      transformers.env.allowLocalModels = false;
      // whisper-base (~150MB): MUITO melhor que tiny em PT. Cacheado depois
      // do 1o download. Trade-off: 1o uso demora mais, qualidade vale.
      return transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-base');
    })().catch((e) => {
      whisperPipelinePromise = null;
      throw e;
    });
  }
  return whisperPipelinePromise;
}

// Resampla o blob de audio pra Float32Array mono a 16kHz (formato exigido
// pelo Whisper). decodeAudioData mantém sample rate original (geralmente
// 44.1k/48k), por isso precisamos resamplear via OfflineAudioContext.
async function blobTo16kMonoFloat32(blob: Blob): Promise<Float32Array> {
  const arrayBuffer = await blob.arrayBuffer();
  const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  const audioBuf = await decodeCtx.decodeAudioData(arrayBuffer);
  decodeCtx.close();
  const targetRate = 16000;
  const length = Math.ceil(audioBuf.duration * targetRate);
  const OfflineCtx = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  const offline = new OfflineCtx(1, length, targetRate);
  const src = offline.createBufferSource();
  src.buffer = audioBuf;
  src.connect(offline.destination);
  src.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

// Transcreve (e opcionalmente traduz direto pra ingles) usando Whisper-base.
// translateToEn=true usa o task 'translate' interno do Whisper — qualidade
// MUITO superior a "transcribe pt + MyMemory pt→en".
export async function transcribeAudioBlob(
  blob: Blob,
  lang: string = 'pt',
  translateToEn: boolean = false,
): Promise<string> {
  try {
    const pipeline = await loadWhisperPipeline();
    const audioData = await blobTo16kMonoFloat32(blob);
    const langCode = lang.split('-')[0];
    const opts = translateToEn
      ? { language: langCode, task: 'translate' as const }   // -> english
      : { language: langCode, task: 'transcribe' as const }; // same language
    const out = await pipeline(audioData, opts);
    const text = (out?.text as string)?.trim() || '';
    console.log(`[whisper] ${translateToEn ? 'translated' : 'transcribed'} (${langCode}):`, text);
    return text;
  } catch (err) {
    console.warn('[whisper] falhou:', err);
    return '';
  }
}

// Lista comum de idiomas pra UI de seleção
export const SUPPORTED_LANGS: { code: string; label: string; flag: string }[] = [
  { code: 'pt-BR', label: 'Português (BR)', flag: '🇧🇷' },
  { code: 'en-US', label: 'English (US)',   flag: '🇺🇸' },
  { code: 'en-GB', label: 'English (UK)',   flag: '🇬🇧' },
  { code: 'es-ES', label: 'Español',        flag: '🇪🇸' },
  { code: 'fr-FR', label: 'Français',       flag: '🇫🇷' },
  { code: 'de-DE', label: 'Deutsch',        flag: '🇩🇪' },
  { code: 'it-IT', label: 'Italiano',       flag: '🇮🇹' },
  { code: 'ja-JP', label: '日本語',          flag: '🇯🇵' },
];
