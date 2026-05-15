// Divisão de vídeo via ffmpeg.wasm — SEM re-encoder (-c copy).
//
// Usado APENAS quando o arquivo passa de 49 MB (limite do Supabase Storage).
// Pra videos pequenos, o caller faz upload direto sem chamar isso.
//
// Vantagens do stream copy (-c copy):
//   - É instantâneo (não decodifica/recodifica frames)
//   - Preserva qualidade original
//   - Cabe em qualquer browser que rode ffmpeg.wasm single-thread
//
// O corte acontece no keyframe mais próximo da marca pedida — pode haver
// imprecisão de até ~2s na borda dos chunks, mas pra stories isso é
// imperceptível.

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ff = new FFmpeg();
    // jsdelivr eh mais confiavel que unpkg (suporta melhor wasm + CORS),
    // e o blob URL evita problemas de COOP/COEP que afetam SAB.
    const baseURL = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';
    await ff.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });
    ffmpegInstance = ff;
    return ff;
  })();
  return loadPromise;
}

/**
 * Divide um vídeo em N pedaços com tamanho aproximadamente igual.
 * Usa stream copy (-c copy) — sem re-encoder, super rápido.
 *
 * @param file Arquivo de vídeo original (pode ser .MOV, .MP4 etc)
 * @param duration Duração total do vídeo em segundos (probe externo)
 * @param maxSizeBytes Tamanho máximo desejado por pedaço (~49 MB)
 * @returns Array de blobs MP4, cada um menor que maxSizeBytes
 */
export async function splitVideoByCopy(
  file: File,
  duration: number,
  maxSizeBytes: number,
): Promise<{ blob: Blob; duration: number }[]> {
  // Calcula em quantos pedaços dividir, com folga de 10% pra metadata
  const targetBytes = maxSizeBytes * 0.9;
  const numParts = Math.ceil(file.size / targetBytes);
  if (numParts <= 1) return []; // não precisa dividir

  const partDuration = duration / numParts;

  const ff = await getFFmpeg();
  const inputName = 'input.bin';
  await ff.writeFile(inputName, await fetchFile(file));

  const results: { blob: Blob; duration: number }[] = [];

  for (let i = 0; i < numParts; i++) {
    const start = i * partDuration;
    const outputName = `out_${i}.mp4`;
    // -c copy = stream copy (sem transcode). -ss antes do -i = seek rápido.
    // -avoid_negative_ts make_zero = corrige timestamps após o cut.
    // -movflags +faststart = MP4 web-friendly.
    await ff.exec([
      '-ss', String(start),
      '-i', inputName,
      '-t', String(partDuration + 0.5),
      '-c', 'copy',
      '-avoid_negative_ts', 'make_zero',
      '-movflags', '+faststart',
      '-y',
      outputName,
    ]);

    const data = await ff.readFile(outputName);
    const buf = data instanceof Uint8Array ? data : new Uint8Array(data as ArrayBuffer);
    results.push({
      blob: new Blob([buf], { type: 'video/mp4' }),
      duration: partDuration,
    });
    try { await ff.deleteFile(outputName); } catch {}
  }

  try { await ff.deleteFile(inputName); } catch {}
  return results;
}
