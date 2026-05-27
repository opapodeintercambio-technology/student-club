// Helpers do client pros cards de preview de link no chat.
//
// extractFirstUrl: regex que pega a PRIMEIRA URL do texto da mensagem.
// fetchLinkPreview: chama /api/link-preview com cache em memoria pra
//   evitar refetch quando a msg re-renderiza ou aparece em multiplas
//   conversas.

import { apiBase } from './apiUrl';

export interface LinkPreview {
  ok: true;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

// Regex generico de URL — pega http(s) seguido de qualquer char nao-whitespace.
// Trim de pontuacao final (. , ! ? ) ] }) que costuma colar na URL em texto.
const URL_RE = /\bhttps?:\/\/[^\s<>"]+/i;

export function extractFirstUrl(text: string | undefined | null): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  if (!m) return null;
  // Remove pontuacao final que provavelmente nao faz parte da URL.
  return m[0].replace(/[.,!?)\]}]+$/, '');
}

// Cache em memoria: { url: Promise<LinkPreview|null> }. Compartilhado entre
// todos os LinkPreviewCard montados — refetch nao acontece quando msg
// re-renderiza, abre a conversa novamente, etc.
const _cache = new Map<string, Promise<LinkPreview | null>>();

export function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  const existing = _cache.get(url);
  if (existing) return existing;
  const p = (async () => {
    try {
      const res = await fetch(`${apiBase()}/api/link-preview?url=${encodeURIComponent(url)}`);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data?.ok) return null;
      return data as LinkPreview;
    } catch {
      return null;
    }
  })();
  _cache.set(url, p);
  return p;
}
