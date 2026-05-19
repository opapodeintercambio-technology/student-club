// Vercel Function: transcreve audio + traduz pra um idioma alvo.
//
// Usa Groq Whisper-large-v3-turbo (gratis, 14.400 req/dia, qualidade SOTA).
// Setup: crie conta em https://console.groq.com/keys, gere API key,
// adicione GROQ_API_KEY nas env vars do Vercel.
//
// Body (JSON):
//   { audioUrl: string, targetLang: string }   // ex: 'en', 'es', 'fr'
// Response:
//   { transcribed: string, translated: string, srcLang: string, targetLang: string }

export const config = { runtime: 'edge' };

const GROQ_API = 'https://api.groq.com/openai/v1/audio';
// Whisper-large-v3-turbo: rapido + qualidade alta. Disponivel no free tier.
const WHISPER_MODEL = 'whisper-large-v3-turbo';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 });
  }
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) {
    return Response.json({
      error: 'GROQ_API_KEY nao configurada. Crie conta gratis em console.groq.com/keys e adicione nas env vars do Vercel.',
    }, { status: 503 });
  }

  let body: { audioUrl?: string; targetLang?: string };
  try { body = await req.json(); }
  catch { return Response.json({ error: 'invalid JSON body' }, { status: 400 }); }

  const audioUrl = body.audioUrl;
  const targetLang = (body.targetLang || 'en').toLowerCase().split('-')[0]; // 'en', 'pt', etc
  if (!audioUrl) return Response.json({ error: 'audioUrl required' }, { status: 400 });

  try {
    // 1) Baixa o blob do audio (Supabase Storage publico)
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(12000) });
    if (!audioRes.ok) {
      return Response.json({ error: `audio download falhou (${audioRes.status})` }, { status: 502 });
    }
    const audioBlob = await audioRes.blob();
    const audioFile = new File([audioBlob], 'audio.webm', { type: audioBlob.type || 'audio/webm' });

    // 2) Estrategia A — target = ingles: usa endpoint /translations do Whisper
    //    (translate-to-english nativo, single shot, melhor qualidade).
    if (targetLang === 'en') {
      const form = new FormData();
      form.append('file', audioFile);
      form.append('model', WHISPER_MODEL);
      form.append('response_format', 'json');
      // Whisper detecta o idioma automaticamente e traduz pra ingles
      const r = await fetch(`${GROQ_API}/translations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
        signal: AbortSignal.timeout(20000),
      });
      if (!r.ok) {
        const txt = await r.text();
        return Response.json({ error: `groq translate falhou: ${txt}` }, { status: 502 });
      }
      const data = await r.json() as { text?: string };
      const translated = (data.text || '').trim();
      return Response.json({
        transcribed: translated, // o texto ja vem em ingles
        translated,
        srcLang: 'auto',
        targetLang: 'en',
      });
    }

    // 3) Estrategia B — target != ingles: transcreve no idioma original,
    //    depois traduz via Google Translate proxy (api/translate).
    const form = new FormData();
    form.append('file', audioFile);
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'verbose_json');
    const transcribeRes = await fetch(`${GROQ_API}/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
      signal: AbortSignal.timeout(20000),
    });
    if (!transcribeRes.ok) {
      const txt = await transcribeRes.text();
      return Response.json({ error: `groq transcribe falhou: ${txt}` }, { status: 502 });
    }
    const transcribeData = await transcribeRes.json() as { text?: string; language?: string };
    const transcribed = (transcribeData.text || '').trim();
    const detectedLang = transcribeData.language || 'auto';

    if (!transcribed) {
      return Response.json({ transcribed: '', translated: '', srcLang: detectedLang, targetLang });
    }

    // Se o idioma detectado ja eh o target, nao traduz
    if (detectedLang.startsWith(targetLang)) {
      return Response.json({ transcribed, translated: transcribed, srcLang: detectedLang, targetLang });
    }

    // Traduz via Google Translate (api/translate.ts ja existente)
    const origin = new URL(req.url).origin;
    const translateUrl = `${origin}/api/translate?q=${encodeURIComponent(transcribed)}&tl=${targetLang}`;
    const transRes = await fetch(translateUrl, { signal: AbortSignal.timeout(8000) });
    const transData = await transRes.json() as { t?: string };
    const translated = (transData.t || transcribed).trim();

    return Response.json({ transcribed, translated, srcLang: detectedLang, targetLang });
  } catch (err: any) {
    return Response.json({ error: err?.message || 'unknown error' }, { status: 500 });
  }
}
