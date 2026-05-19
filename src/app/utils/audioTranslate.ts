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

// ─── Preferência de idioma de tradução do receptor ─────────────────────
const LANG_KEY = (u: string) => `papo_chat_translate_lang_${u}`;

export function getPreferredTranslateLang(currentUser: string): string {
  try {
    const saved = localStorage.getItem(LANG_KEY(currentUser));
    if (saved) return saved;
  } catch {}
  // Default: idioma do browser (ex: 'pt-BR', 'en-US')
  const nav = navigator.language || 'en-US';
  return nav;
}

export function setPreferredTranslateLang(currentUser: string, lang: string): void {
  try { localStorage.setItem(LANG_KEY(currentUser), lang); } catch {}
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
      // Desabilita o cache local (IndexedDB) — modelo eh baixado fresh, mas
      // browser HTTP cache mantem entre sessoes. Evita problemas de CORS.
      transformers.env.allowLocalModels = false;
      return transformers.pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny');
    })().catch((e) => {
      whisperPipelinePromise = null; // permite retry
      throw e;
    });
  }
  return whisperPipelinePromise;
}

// Transcreve um Blob de audio (qualquer formato suportado pelo browser).
// Retorna string vazia em caso de erro.
export async function transcribeAudioBlob(blob: Blob, lang: string = 'pt'): Promise<string> {
  try {
    const pipeline = await loadWhisperPipeline();
    // Whisper aceita ArrayBuffer ou URL. Convertemos blob -> Float32Array
    // via AudioContext pra garantir compatibilidade com WebM/MP4/OGG.
    const arrayBuffer = await blob.arrayBuffer();
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    const audioBuf = await audioCtx.decodeAudioData(arrayBuffer);
    const audioData = audioBuf.getChannelData(0);
    audioCtx.close();
    // Normaliza pt-BR -> pt pra Whisper
    const langCode = lang.split('-')[0];
    const out = await pipeline(audioData, { language: langCode, task: 'transcribe' });
    return (out?.text as string)?.trim() || '';
  } catch (err) {
    console.warn('[whisper-fallback] falhou:', err);
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
