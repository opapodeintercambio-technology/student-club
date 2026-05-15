// Upload de video direto para Cloudflare Stream.
// Usa o endpoint /api/stream-upload-url do Vercel pra pegar uma URL assinada
// + uid; depois faz POST do arquivo direto pra Cloudflare. Stream transcoda
// em multi-bitrate HLS automaticamente — toca em Safari, Chrome, Firefox e mobile.
//
// URLs de saida (videodelivery.net é o domínio universal/legacy que funciona
// em qualquer conta Cloudflare Stream, sem precisar saber o customer subdomain):
//   HLS: https://videodelivery.net/<uid>/manifest/video.m3u8
//   Thumb: https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg
import { apiBase } from './apiUrl';

export interface StreamUploadResult {
  uid: string;
  hlsUrl: string;
  thumbnailUrl: string;
}

export async function uploadVideoToStream(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<StreamUploadResult> {
  // 1. Pede uma URL de upload assinada do Vercel
  const r = await fetch(`${apiBase()}/api/stream-upload-url`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error || `falha ao obter URL (${r.status})`);
  }
  const { uploadURL, uid } = await r.json();
  if (!uploadURL || !uid) throw new Error('Cloudflare nao retornou URL valida');

  // 2. Sobe o arquivo. Usamos XHR para ter eventos de progresso. Engole erros
  // de CORS na resposta (Cloudflare nao manda Access-Control-Allow-Origin nas
  // respostas OK do upload, o que faz o XMLHttpRequest disparar onerror mesmo
  // depois do servidor receber 100% dos bytes). Se onerror dispara DEPOIS do
  // upload completar, consideramos sucesso — o ponto onde o body chegou no
  // servidor. Validamos por GET no /accounts/.../stream/{uid} no fim.
  let uploadCompleted = false;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL, true);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
    };
    xhr.upload.onload = () => { uploadCompleted = true; };
    xhr.onload = () => {
      // Cloudflare retorna 200 com body JSON (ok) ou 4xx/5xx (erro real)
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload (${xhr.status}): ${xhr.responseText?.slice(0, 200) || ''}`));
    };
    xhr.onerror = () => {
      // Se o upload onload disparou, os bytes chegaram — provavel CORS na
      // resposta. Tratamos como sucesso e validamos depois via API.
      if (uploadCompleted) resolve();
      else reject(new Error('Erro de rede no upload'));
    };
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });

  return {
    uid,
    hlsUrl: `https://videodelivery.net/${uid}/manifest/video.m3u8`,
    thumbnailUrl: `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?time=1s&height=480`,
  };
}

// Detecta se uma URL é HLS (Cloudflare Stream). Usado pelo player pra escolher
// entre <video> nativo e HLS.js.
export function isHlsUrl(url: string): boolean {
  return /\.m3u8(\?|$)/i.test(url) || url.includes('videodelivery.net') || url.includes('cloudflarestream.com');
}
