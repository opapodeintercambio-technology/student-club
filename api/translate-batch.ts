// /api/translate-batch — traduz múltiplos textos em uma única request.
//
// Reusa a mesma cadeia de fallbacks do /api/translate (Cloud Translate →
// DeepL → MyMemory → gtx), só que processando em paralelo (Promise.all).
//
// Body esperado:
//   POST /api/translate-batch
//   { "items": [ { "q": "texto", "tl": "en" }, ... ] }
// Resposta:
//   { "results": [ "translated text", ... ] }
//
// Performance: reduz N requests HTTP do client para 1, e dentro do server
// chama N traducoes em paralelo (cada provider aguenta multi-conn).

export const config = { runtime: 'edge' };

interface Item { q: string; tl: string }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

async function googleCloudTranslate(text: string, target: string, apiKey: string): Promise<string> {
  const res = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target, format: 'text' }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Cloud ${res.status}`);
  const data = await res.json();
  return data?.data?.translations?.[0]?.translatedText || text;
}

async function deepLTranslate(text: string, target: string, apiKey: string): Promise<string> {
  const tlMap: Record<string, string> = {
    en: 'EN', pt: 'PT-BR', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', ja: 'JA',
  };
  const tl = tlMap[target.toLowerCase()] || target.toUpperCase();
  const host = apiKey.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `text=${encodeURIComponent(text)}&target_lang=${tl}`,
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`DeepL ${res.status}`);
  const data = await res.json();
  return data?.translations?.[0]?.text || text;
}

async function myMemoryTranslate(text: string, target: string): Promise<string> {
  const tlMap: Record<string, string> = {
    en: 'en-US', es: 'es-ES', pt: 'pt-BR', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', ja: 'ja-JP',
  };
  const tl = tlMap[target.toLowerCase()] || (target.includes('-') ? target : `${target}-${target.toUpperCase()}`);
  if (tl.startsWith('pt')) return text;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`pt-BR|${tl}`)}&de=suporte@studentclub.app`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`MyMemory ${res.status}`);
  const data = await res.json();
  const t = data?.responseData?.translatedText;
  const status = String(data?.responseStatus || '');
  if (!t || status !== '200') throw new Error(`MyMemory ${status}`);
  return t;
}

async function gtxTranslate(text: string, target: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`gtx ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.[0])
    ? (data[0] as Array<[string]>).map(item => item?.[0] ?? '').join('')
    : text;
}

async function translateOne(text: string, target: string): Promise<string> {
  const q = text.slice(0, 499);
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  const deepLKey = process.env.DEEPL_API_KEY;

  if (googleKey) {
    try { return await googleCloudTranslate(q, target, googleKey); } catch {}
  }
  if (deepLKey) {
    try { return await deepLTranslate(q, target, deepLKey); } catch {}
  }
  try { return await myMemoryTranslate(q, target); } catch {}
  try { return await gtxTranslate(q, target); } catch {}
  return text;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  let body: { items?: Item[] };
  try { body = await req.json(); } catch { return jsonResponse({ results: [] }); }

  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (items.length === 0) return jsonResponse({ results: [] });

  // Traduz todos em paralelo
  const results = await Promise.all(
    items.map(it => translateOne(it.q || '', it.tl || 'en'))
  );

  return jsonResponse({ results });
}
