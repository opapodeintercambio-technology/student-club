// Compressão de vídeo cross-browser via ffmpeg.wasm.
//
// Por que ffmpeg.wasm em vez de MediaRecorder?
//   - MediaRecorder no Chrome <130 só gera WebM → Safari não toca em Mac/iPhone
//   - iOS Safari não tem video.captureStream() → MediaRecorder nem inicia
//   - Resultado: usuários Safari ficavam sem ver vídeos postados de Chrome,
//     e usuários de iPhone não conseguiam postar.
//
// ffmpeg.wasm roda no browser e produz H.264 MP4 (universal). É single-thread
// pra não precisar de SharedArrayBuffer (que exige headers especiais).
//
// Custo: ~5s de download na primeira carga (cached depois). Bitrate alvo
// ~1.5Mbps vídeo + 96kbps áudio → ~6MB pra 30s, dentro do limite Supabase.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

// Carrega o core uma única vez. Próximas chamadas reusam a instância.
async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ff;
    return ff;
  })();
  return loadPromise;
}

export interface CompressProgress {
  /** 0..1 do total da operação */
  progress: number;
  /** etapa atual: 'loading' = baixando ffmpeg, 'encoding' = transcodando */
  stage: 'loading' | 'encoding';
}

export async function compressVideo(
  file: File,
  opts?: {
    maxSec?: number;
    onProgress?: (p: CompressProgress) => void;
  },
): Promise<{ blob: Blob; duration: number }[]> {
  const maxSec = opts?.maxSec ?? 30;
  const onProgress = opts?.onProgress;

  onProgress?.({ progress: 0, stage: 'loading' });
  const ff = await getFFmpeg();
  onProgress?.({ progress: 0, stage: 'encoding' });

  // Probe duração via ffprobe (ffmpeg pode reportar via stderr, mas é mais
  // simples usar <video> pra pegar duration).
  const total = await probeVideoDuration(file);
  const segments = total > maxSec + 0.5
    ? splitTimeline(total, maxSec)
    : [{ start: 0, length: total }];

  // Escreve o arquivo de entrada uma vez no FS virtual do ffmpeg
  const inputName = 'input.bin';
  await ff.writeFile(inputName, await fetchFile(file));

  // Handler de progresso unificado (ffmpeg.wasm emite progress 0..1 por execução)
  let segIdx = 0;
  ff.on('progress', ({ progress }) => {
    if (onProgress && progress >= 0 && progress <= 1) {
      const overall = (segIdx + progress) / segments.length;
      onProgress({ progress: Math.min(0.99, overall), stage: 'encoding' });
    }
  });

  const results: { blob: Blob; duration: number }[] = [];

  for (let i = 0; i < segments.length; i++) {
    segIdx = i;
    const { start, length } = segments[i];
    const outputName = `output_${i}.mp4`;

    // -ss antes do -i = seek rápido (keyframe-only). -t = duração.
    // -c:v libx264 -preset ultrafast -crf 28 = compressão rápida com
    // qualidade aceitável pra stories. -b:v 1500k = bitrate alvo.
    // -movflags +faststart = MP4 streamable (web friendly).
    // -vf scale força resolução máxima 720x720 mantendo aspect ratio
    // (vídeos verticais ficam 720 de largura, horizontais 720 de altura).
    const args = [
      '-ss', String(start),
      '-i', inputName,
      '-t', String(length),
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-b:v', '1500k',
      '-maxrate', '2000k',
      '-bufsize', '3000k',
      '-vf', "scale='if(gt(iw,ih),720,-2)':'if(gt(iw,ih),-2,720)'",
      '-c:a', 'aac',
      '-b:a', '96k',
      '-ac', '2',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ];
    await ff.exec(args);

    const data = await ff.readFile(outputName);
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    results.push({
      blob: new Blob([buf], { type: 'video/mp4' }),
      duration: length,
    });
    try { await ff.deleteFile(outputName); } catch {}
  }

  try { await ff.deleteFile(inputName); } catch {}
  onProgress?.({ progress: 1, stage: 'encoding' });

  return results;
}

function splitTimeline(total: number, maxSec: number): { start: number; length: number }[] {
  const segments: { start: number; length: number }[] = [];
  let start = 0;
  while (start < total - 0.05) {
    const length = Math.min(maxSec, total - start);
    segments.push({ start, length });
    start += length;
  }
  return segments;
}

function probeVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) && d > 0 ? d : 0);
    };
    v.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Falha ao ler vídeo')); };
    v.src = url;
  });
}
