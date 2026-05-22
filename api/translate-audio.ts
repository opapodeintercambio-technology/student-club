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
// Modelos Whisper no Groq:
// - whisper-large-v3-turbo: rapido (~10x), MAS so suporta /transcriptions
// - whisper-large-v3:       suporta /transcriptions E /translations
// Usamos turbo para transcrever (alvos != en) e o full quando precisamos
// traduzir para ingles via endpoint /translations.
const WHISPER_TRANSCRIBE = 'whisper-large-v3-turbo';
const WHISPER_TRANSLATE = 'whisper-large-v3';

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
    // 1) Baixa o blob do audio (Supabase Storage publico).
    //    Timeout aumentado de 12s -> 25s pra audios maiores em 3G/4G.
    const audioRes = await fetch(audioUrl, { signal: AbortSignal.timeout(25000) });
    if (!audioRes.ok) {
      return Response.json({ error: `audio download falhou (${audioRes.status})` }, { status: 502 });
    }
    const audioBlob = await audioRes.blob();

    // Detecta extensao real baseada no mime type do blob (iOS usa mp4/m4a,
    // Android usa mp4, desktop usa webm). Whisper Groq usa o filename pra
    // identificar o formato — se mandar audio.webm e for m4a, falha. Antes
    // forcava 'audio.webm' sempre, fazia falhar pra users iOS/Android com
    // gravacao em m4a/mp4.
    const blobType = (audioBlob.type || '').toLowerCase();
    let filename = 'audio.webm';
    if (blobType.includes('mp4') || blobType.includes('m4a') || audioUrl.endsWith('.m4a') || audioUrl.endsWith('.mp4')) {
      filename = 'audio.m4a';
    } else if (blobType.includes('ogg') || audioUrl.endsWith('.ogg')) {
      filename = 'audio.ogg';
    } else if (blobType.includes('mpeg') || audioUrl.endsWith('.mp3')) {
      filename = 'audio.mp3';
    } else if (blobType.includes('wav') || audioUrl.endsWith('.wav')) {
      filename = 'audio.wav';
    }
    const audioFile = new File([audioBlob], filename, { type: audioBlob.type || 'audio/webm' });

    // 2) Estrategia A — target = ingles: usa endpoint /translations do Whisper
    //    (translate-to-english nativo, single shot, melhor qualidade).
    if (targetLang === 'en') {
      const form = new FormData();
      form.append('file', audioFile);
      form.append('model', WHISPER_TRANSLATE);
      form.append('response_format', 'json');
      // Whisper detecta o idioma automaticamente e traduz pra ingles.
      // Timeout aumentado de 20s -> 35s pra audios mais longos.
      const r = await fetch(`${GROQ_API}/translations`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${groqKey}` },
        body: form,
        signal: AbortSignal.timeout(35000),
      });
      if (!r.ok) {
        const txt = await r.text();
        // Loga formato do audio + erro do Groq pra facilitar debug
        console.error('[translate-audio] groq /translations falhou', { status: r.status, filename, mime: blobType, txt });
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
    form.append('model', WHISPER_TRANSCRIBE);
    form.append('response_format', 'verbose_json');
    const transcribeRes = await fetch(`${GROQ_API}/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${groqKey}` },
      body: form,
      signal: AbortSignal.timeout(35000),
    });
    if (!transcribeRes.ok) {
      const txt = await transcribeRes.text();
      console.error('[translate-audio] groq /transcriptions falhou', { status: transcribeRes.status, filename, mime: blobType, txt });
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
