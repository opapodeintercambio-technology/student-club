// /api/translate — proxy server-side de tradução de texto, TOS-compliant
//
// HISTORICO:
//   ANTES: usava translate.googleapis.com/translate_a/single?client=gtx
//   — endpoint INTERNO do Google (Chrome translator). NAO licenciado pra
//   apps comerciais. Violava Google Cloud TOS + Apple §5.2.5 + Play
//   "Misleading Behavior". Risco de bloqueio + rejeicao na review.
//
//   AGORA: stack TOS-compliant em camadas:
//   1) GOOGLE_TRANSLATE_API_KEY env -> Cloud Translate v2 (oficial, pago,
//      ~US$ 20/M chars). Melhor qualidade.
//   2) DEEPL_API_KEY env -> DeepL Free (500K chars/mes free) ou Pro.
//   3) Fallback gratis: LibreTranslate publico (libretranslate.de) —
//      OSS, rate-limited mas compliant.
//
// Set env no Vercel:
//   GOOGLE_TRANSLATE_API_KEY=... (recomendado pra producao)
//   DEEPL_API_KEY=... (alternativa, qualidade similar)
//
// Sem env nenhum, cai no LibreTranslate (free, rate-limited).

export const config = { runtime: 'edge' };

interface TranslateResult { t: string }

async function googleCloudTranslate(text: string, target: string, apiKey: string): Promise<string> {
  const url = `https://translation.googleapis.com/language/translate/v2?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, target, format: 'text' }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`Cloud Translate ${res.status}`);
  const data = await res.json();
  return data?.data?.translations?.[0]?.translatedText || text;
}

async function deepLTranslate(text: string, target: string, apiKey: string): Promise<string> {
  // DeepL precisa do target em CAIXA-ALTA (EN, PT-BR, etc.)
  const tlMap: Record<string, string> = {
    en: 'EN', pt: 'PT-BR', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', ja: 'JA',
  };
  const tl = tlMap[target.toLowerCase()] || target.toUpperCase();
  // Free tier usa api-free.deepl.com, Pro usa api.deepl.com
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

async function libreTranslate(text: string, target: string): Promise<string> {
  // LibreTranslate publico (OSS, free, rate-limited). Sem auth.
  const res = await fetch('https://libretranslate.de/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'auto', target, format: 'text' }),
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) throw new Error(`LibreTranslate ${res.status}`);
  const data = await res.json();
  return data?.translatedText || text;
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const text = url.searchParams.get('q') ?? '';
  const target = url.searchParams.get('tl') ?? 'en';

  if (!text.trim()) return Response.json({ t: text } as TranslateResult);

  const q = text.slice(0, 499);

  // Cadeia de fallbacks (ordem: Cloud Translate -> DeepL -> LibreTranslate)
  const googleKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  const deepLKey = process.env.DEEPL_API_KEY;

  try {
    if (googleKey) {
      return Response.json({ t: await googleCloudTranslate(q, target, googleKey) });
    }
  } catch (e) {
    console.warn('[translate] Cloud Translate falhou, tentando DeepL', e);
  }

  try {
    if (deepLKey) {
      return Response.json({ t: await deepLTranslate(q, target, deepLKey) });
    }
  } catch (e) {
    console.warn('[translate] DeepL falhou, tentando LibreTranslate', e);
  }

  try {
    return Response.json({ t: await libreTranslate(q, target) });
  } catch (e) {
    console.error('[translate] todos os providers falharam', e);
    return Response.json({ t: text });
  }
}
