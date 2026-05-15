// Upload de video direto para Cloudflare Stream.
// Usa o endpoint /api/stream-upload-url do Vercel pra pegar uma URL assinada,
// depois faz POST do arquivo direto pra Cloudflare. Stream transcoda em
// multi-bitrate HLS automaticamente — toca em Safari, Chrome, Firefox, mobile.
//
// Uma vez upado, expoe URLs publicas universais (videodelivery.net):
//   HLS playback: https://videodelivery.net/<uid>/manifest/video.m3u8
//   Thumbnail:    https://videodelivery.net/<uid>/thumbnails/thumbnail.jpg
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
  // 1. Pede uma URL de upload assinada
  const r = await fetch(`${apiBase()}/api/stream-upload-url`, { method: 'POST' });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error(err?.error || `falha ao obter URL (${r.status})`);
  }
  const { uploadURL, uid } = await r.json();
  if (!uploadURL || !uid) throw new Error('Cloudflare nao retornou URL valida');

  // 2. Sobe o arquivo via XMLHttpRequest (precisa pra ter eventos de progresso)
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadURL, true);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded / ev.total);
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload falhou (${xhr.status}): ${xhr.responseText.slice(0, 200)}`));
    };
    xhr.onerror = () => reject(new Error('Erro de rede no upload'));
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
  return /\.m3u8(\?|$)/i.test(url) || url.includes('videodelivery.net');
}
