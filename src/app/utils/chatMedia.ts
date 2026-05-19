import { supabase } from '../../lib/supabase';

const BUCKET = 'chat-media';

export type MediaKind = 'image' | 'video' | 'audio' | 'deal' | 'dealRequest' | 'dealRejected' | 'donationAccepted' | 'donationClosedByMe';

export interface DealProduct {
  id: string;
  title: string;
  image: string;
  username: string;
  description?: string;
  category?: string;
}

export interface RichMessage {
  type?: MediaKind;
  url?: string;
  mime?: string;
  duration?: number;
  caption?: string;
  replyTo?: { id: string; text: string; sender: string };
  dealProduct?: DealProduct;
  dealFromProduct?: DealProduct;
  // Tradução simultânea de áudio:
  // transcript = texto reconhecido do áudio no idioma original (STT em tempo real)
  // srcLang    = idioma de origem (ex: 'pt-BR')
  // Receptor traduz on-demand pro seu idioma preferido + toca via SpeechSynthesis.
  transcript?: string;
  srcLang?: string;
}

const TAG_RE = /^\s*\[CMSG\]([\s\S]+?)\[\/CMSG\]\s*$/;

export function buildRichMessage(text: string, rich?: Omit<RichMessage, 'caption'>): string {
  if (!rich || (!rich.type && !rich.replyTo)) return text;
  const payload: RichMessage = { ...rich, caption: text || undefined };
  return `[CMSG]${JSON.stringify(payload)}[/CMSG]`;
}

export function parseRichMessage(text: string): RichMessage | null {
  if (!text || !text.startsWith('[CMSG]')) return null;
  const m = text.match(TAG_RE);
  if (!m) return null;
  try { return JSON.parse(m[1]) as RichMessage; } catch { return null; }
}

export async function uploadMedia(
  file: Blob,
  ext: string,
  convId: string,
  kind: MediaKind,
): Promise<{ url: string; mime: string } | { error: string }> {
  const safeConv = convId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${safeConv}/${kind}/${Date.now()}-${rand}.${ext}`;
  // Normaliza o mime: remove parâmetros tipo ";codecs=opus" que o Supabase Storage não aceita
  const rawMime = file.type || `${kind}/${ext}`;
  const mime = rawMime.split(';')[0].trim() || `${kind}/${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) {
    console.error('[chatMedia] upload error', error.message, { mime, ext, kind, size: file.size });
    // Retry sem contentType (deixa o Supabase inferir)
    const retry = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (retry.error) {
      console.error('[chatMedia] upload retry error', retry.error.message);
      return { error: retry.error.message };
    }
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, mime };
}

export function extFromMime(mime: string, fallback: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'audio/webm': 'webm', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/wav': 'wav',
  };
  return map[mime] || fallback;
}

export async function getRecorderMimeType(): Promise<string> {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  // Detecta plataforma: Android (Capacitor) prefere mp4 (suporte nativo), web prefere webm/opus
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isAndroid = /Android/i.test(ua);
  const candidates = isAndroid
    ? ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg']
    : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
  for (const c of candidates) if (MediaRecorder.isTypeSupported(c)) return c;
  return 'audio/webm';
}
