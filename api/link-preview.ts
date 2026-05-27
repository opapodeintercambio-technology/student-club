// /api/link-preview — busca metadados Open Graph de uma URL.
//
// Usado pelos cards de preview de link no chat (estilo WhatsApp/Instagram).
// Quando o user cola "https://exemplo.com/artigo" numa mensagem, o ChatPanel
// chama esse endpoint, recebe { title, description, image, siteName } e
// renderiza um card abaixo do balao.
//
// Estrategia:
//   1) Atalhos pra dominios comuns que sao caros/instaveis de scrappar:
//      - YouTube → oEmbed publico (sem auth) + thumb direto via i.ytimg.com
//   2) Fallback generico: fetch HTML + regex em <title>, <meta og:*>,
//      <meta twitter:*>. User-Agent realista pra nao ser bloqueado.
//
// Cache: HTTP s-maxage=86400 (Vercel CDN cacheia por 24h por URL).
// Timeout: 5s pra nao pendurar.
//
// Body:  GET /api/link-preview?url=https%3A%2F%2F...
// Resp:  { ok: true, title, description, image, siteName, url }
//        ou { ok: false, error: string }

export const config = { runtime: 'edge' };

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

interface PreviewData {
  ok: true;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  url: string;
}

function jsonResponse(body: unknown, status = 200, cacheable = true): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
      // Cache 24h no CDN da Vercel + stale-while-revalidate 7d.
      // Cacheia por URL exata (cada link e uma key separada).
      ...(cacheable
        ? { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' }
        : {}),
    },
  });
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /youtube\.com\/watch\?v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /youtube\.com\/shorts\/([\w-]{11})/,
    /youtube\.com\/embed\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  return null;
}

// Helper: extrai conteudo de <meta property="X" content="Y"> ou name="X".
function extractMeta(html: string, key: string): string | undefined {
  // Tenta property primeiro (Open Graph), depois name (Twitter, fallback).
  const variants = [
    new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["']`, 'i'),
  ];
  for (const re of variants) {
    const m = html.match(re);
    if (m) return decodeHtmlEntities(m[1]);
  }
  return undefined;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m ? decodeHtmlEntities(m[1].trim()) : undefined;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function resolveUrl(maybeRelative: string, base: string): string {
  try { return new URL(maybeRelative, base).toString(); }
  catch { return maybeRelative; }
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        // Muitos sites bloqueiam UAs genericos. Posa de Chrome desktop.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

// YouTube tem oEmbed publico (sem auth) que retorna {title, author_name,
// thumbnail_url}. Bem mais leve que scrappar a pagina inteira.
async function fetchYouTubePreview(videoId: string): Promise<PreviewData> {
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetchWithTimeout(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      4000,
    );
    if (res.ok) {
      const data = await res.json() as { title?: string; author_name?: string };
      return {
        ok: true,
        title: data.title,
        description: data.author_name ? `por ${data.author_name}` : undefined,
        // maxresdefault.jpg eh 1280x720; cai pra hqdefault se nao existir.
        image: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
        siteName: 'YouTube',
        url: watchUrl,
      };
    }
  } catch { /* fallback abaixo */ }
  // Fallback minimo: so thumb + URL.
  return {
    ok: true,
    title: 'YouTube',
    image: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    siteName: 'YouTube',
    url: watchUrl,
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== 'GET') {
    return jsonResponse({ ok: false, error: 'method not allowed' }, 405, false);
  }

  const url = new URL(req.url).searchParams.get('url');
  if (!url) return jsonResponse({ ok: false, error: 'missing url param' }, 400, false);

  // Validar URL minima
  let target: URL;
  try { target = new URL(url); }
  catch { return jsonResponse({ ok: false, error: 'invalid url' }, 400, false); }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') {
    return jsonResponse({ ok: false, error: 'only http(s)' }, 400, false);
  }

  // Atalho YouTube
  const ytId = extractYouTubeId(url);
  if (ytId) {
    const data = await fetchYouTubePreview(ytId);
    return jsonResponse(data);
  }

  // Generic Open Graph scrape
  try {
    const res = await fetchWithTimeout(url, 5000);
    if (!res.ok) {
      return jsonResponse({ ok: false, error: `status ${res.status}` }, 200, false);
    }
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html') && !ct.includes('application/xhtml')) {
      return jsonResponse({ ok: false, error: 'not html' }, 200, false);
    }
    // Limita pra 256KB — paginas com og:tags no <head> nao precisam de mais.
    const reader = res.body?.getReader();
    if (!reader) {
      return jsonResponse({ ok: false, error: 'no body' }, 200, false);
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    const MAX = 256 * 1024;
    while (total < MAX) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
    reader.cancel().catch(() => {});
    const html = new TextDecoder('utf-8').decode(
      new Uint8Array(chunks.reduce<number[]>((acc, c) => { acc.push(...c); return acc; }, [])),
    );

    const ogTitle = extractMeta(html, 'og:title') || extractMeta(html, 'twitter:title');
    const ogDesc = extractMeta(html, 'og:description') || extractMeta(html, 'twitter:description') || extractMeta(html, 'description');
    const ogImg = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image');
    const ogSite = extractMeta(html, 'og:site_name');
    const pageTitle = extractTitle(html);

    const data: PreviewData = {
      ok: true,
      title: ogTitle || pageTitle || target.hostname,
      description: ogDesc,
      image: ogImg ? resolveUrl(ogImg, url) : undefined,
      siteName: ogSite || target.hostname.replace(/^www\./, ''),
      url,
    };
    return jsonResponse(data);
  } catch (e: any) {
    return jsonResponse({ ok: false, error: e?.message || 'fetch failed' }, 200, false);
  }
}
