// Endpoint Vercel que gera uma URL assinada de upload direto pra Cloudflare
// Stream. O cliente faz POST no Stream URL com o video — Cloudflare cuida
// do transcode em multi-bitrate HLS.
//
// Fluxo:
//   1. Cliente chama POST /api/stream-upload-url
//   2. Servidor pede pra Cloudflare uma "direct creator upload URL"
//   3. Servidor responde { uploadURL, uid }
//   4. Cliente faz POST no uploadURL com o video (multipart form)
//   5. Cloudflare retorna 200 quando o upload acaba (transcode roda em segundo plano)
//   6. Cliente salva o uid na tabela stories_demo com a URL HLS:
//      https://customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8
//
// Limites: maxDurationSeconds=60 evita videos enormes. expiry=2min evita
// que a URL fique valida pra sempre.

const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const CF_TOKEN = process.env.CLOUDFLARE_STREAM_TOKEN;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!CF_ACCOUNT || !CF_TOKEN) {
    return res.status(500).json({ error: 'Cloudflare Stream not configured' });
  }

  // Cloudflare exige expiry estritamente > 2min. Usamos 5min de janela.
  const expiry = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  try {
    const r = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${CF_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          // 60s cobre stories e feed (limite unico, estilo Reels/Instagram).
          // Feed: a UI ja aplica o limite no VideoEditor (maxDuration=60),
          // mas mantemos a barreira tambem do lado do Cloudflare como defesa.
          maxDurationSeconds: 60,
          expiry,
          // requireSignedURLs: false → vídeo é publico, sem token de player
          requireSignedURLs: false,
        }),
      },
    );
    const data = await r.json();
    if (!r.ok || !data?.success) {
      // Mostra o erro real do Cloudflare para diagnosticar (token invalido,
      // permissao insuficiente, account id errado, etc).
      const cfError = data?.errors?.[0]?.message || `HTTP ${r.status}`;
      return res.status(502).json({
        error: `Cloudflare: ${cfError}`,
        detail: data,
      });
    }
    // data.result = { uploadURL, uid }
    return res.status(200).json({
      uploadURL: data.result.uploadURL,
      uid: data.result.uid,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || 'unknown' });
  }
}
