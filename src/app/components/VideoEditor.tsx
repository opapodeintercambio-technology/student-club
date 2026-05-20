// Editor de vídeo estilo Instagram — trim (cortar início/fim) + filtros (CSS).
// Não tem dependência externa: usa <canvas>.captureStream() + MediaRecorder
// pra "queimar" o filtro/trim no arquivo final antes do upload.
//
// Fluxo:
//   1. Modal abre com o vídeo em ObjectURL, scrubber dual-handle pra start/end,
//      e chips de filtro (sem filtro / Mono / Sépia / Vívido / Frio / Quente /
//      Vintage / Drama).
//   2. Preview real-time: CSS filter aplicado no <video>.
//   3. Confirmar: renderiza o segmento [start, end] num canvas com o filtro
//      via WebGL/2D, captura como MediaStream, grava com MediaRecorder, e
//      devolve um File novo pro callback. Audio: trilha do <video> via
//      captureStream() é misturada no stream final.
//
// Limites conhecidos:
//   - Safari iOS < 17 não suporta canvas.captureStream com audio sync perfeito.
//     Fallback: se MediaRecorder não disponível, devolve o arquivo original
//     (cliente fica com filtro só no preview, mas sobe sem filtro).
//   - MediaRecorder no Chrome grava webm/vp9; iOS 17+ grava mp4. Cloudflare
//     Stream aceita os dois e transcoda pra HLS.
import { useEffect, useRef, useState } from 'react';
import { X, Check, Scissors, Sparkles, Loader2 } from 'lucide-react';

export interface VideoFilter {
  key: string;
  label: string;
  css: string;
}

const FILTERS: VideoFilter[] = [
  { key: 'none',    label: 'Original', css: 'none' },
  { key: 'mono',    label: 'Mono',     css: 'grayscale(1) contrast(1.05)' },
  { key: 'sepia',   label: 'Sépia',    css: 'sepia(0.85) saturate(1.1)' },
  { key: 'vivid',   label: 'Vívido',   css: 'saturate(1.4) contrast(1.1)' },
  { key: 'cool',    label: 'Frio',     css: 'hue-rotate(-12deg) saturate(1.1) brightness(1.02)' },
  { key: 'warm',    label: 'Quente',   css: 'hue-rotate(10deg) saturate(1.15) brightness(1.03)' },
  { key: 'vintage', label: 'Vintage',  css: 'sepia(0.35) contrast(0.95) brightness(1.05) saturate(0.9)' },
  { key: 'drama',   label: 'Drama',    css: 'contrast(1.25) saturate(1.05) brightness(0.95)' },
];

interface Props {
  file: File;
  onCancel: () => void;
  onConfirm: (file: File) => void;
  /** Duração máxima permitida no output (segundos). 60 pra reels, 300 pro feed. */
  maxDuration?: number;
}

function fmt(t: number): string {
  if (!isFinite(t)) return '0:00';
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VideoEditor({ file, onCancel, onConfirm, maxDuration = 300 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [filter, setFilter] = useState<VideoFilter>(FILTERS[0]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function onLoadedMetadata() {
    const v = videoRef.current; if (!v) return;
    const dur = v.duration || 0;
    setDuration(dur);
    setStart(0);
    setEnd(Math.min(dur, maxDuration));
  }

  // Mantém o vídeo dentro de [start, end] durante o preview
  function onTimeUpdate() {
    const v = videoRef.current; if (!v) return;
    if (v.currentTime < start) v.currentTime = start;
    if (v.currentTime > end) {
      v.currentTime = start;
      v.play().catch(() => {});
    }
  }

  function clampStart(val: number) {
    const next = Math.max(0, Math.min(val, end - 0.5));
    setStart(next);
    const v = videoRef.current;
    if (v) v.currentTime = next;
  }
  function clampEnd(val: number) {
    const next = Math.min(duration, Math.max(val, start + 0.5));
    setEnd(next);
  }

  async function handleConfirm() {
    setBusy(true);
    setProgress(0);
    try {
      const out = await renderEditedVideo({
        file, src: src!, start, end, filterCss: filter.css,
        onProgress: setProgress,
      });
      onConfirm(out);
    } catch (e: any) {
      console.error('[video-editor]', e);
      // Fallback gracioso: se render falhar, usa o arquivo original
      // (user ainda vai conseguir postar, só sem o trim/filtro).
      alert('Não foi possível aplicar o filtro/corte. Vou postar o vídeo original.');
      onConfirm(file);
    } finally {
      setBusy(false);
    }
  }

  const outDur = end - start;
  const tooLong = outDur > maxDuration;

  return (
    <div
      className="fixed inset-0 z-[10500] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.92)' }}
    >
      <div className="w-full h-full sm:max-w-md sm:h-auto sm:max-h-[95vh] sm:rounded-3xl bg-black flex flex-col overflow-hidden">
        {/* Header — paddingTop respeita o notch do iPhone (status bar)
            pra que os botões Cancelar/Concluído não fiquem sob bateria/rede. */}
        <div
          className="flex items-center justify-between px-3 pb-2 flex-shrink-0"
          style={{ background: '#0c1014', paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}
        >
          <button onClick={onCancel} disabled={busy} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-white/10 disabled:opacity-40" aria-label="Cancelar">
            <X className="w-5 h-5 text-white" />
          </button>
          <h3 className="text-sm font-bold text-white">Editar vídeo</h3>
          <button
            onClick={handleConfirm}
            disabled={busy || tooLong || outDur < 0.5}
            className="px-3 h-9 rounded-full flex items-center gap-1.5 text-xs font-bold disabled:opacity-40"
            style={{ background: '#1e714a', color: '#fff' }}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            {busy ? 'Aplicando…' : 'Concluído'}
          </button>
        </div>

        {/* Preview */}
        <div className="flex-1 flex items-center justify-center min-h-0" style={{ background: '#000' }}>
          {src && (
            <video
              ref={videoRef}
              src={src}
              className="max-w-full max-h-full"
              autoPlay
              muted
              loop
              playsInline
              onLoadedMetadata={onLoadedMetadata}
              onTimeUpdate={onTimeUpdate}
              style={{ filter: filter.css }}
            />
          )}
        </div>

        {/* Controles — paddingBottom respeita home-indicator do iPhone */}
        <div
          className="flex-shrink-0 px-4 pt-3 space-y-3"
          style={{ background: '#0c1014', paddingBottom: 'calc(env(safe-area-inset-bottom) + 12px)' }}
        >
          {busy ? (
            <div className="text-center text-xs text-white/80 py-2">
              Renderizando vídeo… {Math.round(progress * 100)}%
              <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full transition-all" style={{ width: `${progress * 100}%`, background: '#1e714a' }} />
              </div>
            </div>
          ) : (
            <>
              {/* Trim */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Scissors className="w-3.5 h-3.5 text-white/70" />
                  <span className="text-[11px] text-white/70 font-semibold uppercase tracking-widest">Cortar</span>
                  <span className="ml-auto text-[11px] text-white/60 tabular-nums">
                    {fmt(start)} → {fmt(end)} <span className={tooLong ? 'text-red-400' : ''}>({fmt(outDur)})</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 w-10">Início</span>
                    <input
                      type="range" min={0} max={Math.max(duration, 0)} step={0.1}
                      value={start} onChange={e => clampStart(parseFloat(e.target.value))}
                      className="flex-1 accent-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-white/50 w-10">Fim</span>
                    <input
                      type="range" min={0} max={Math.max(duration, 0)} step={0.1}
                      value={end} onChange={e => clampEnd(parseFloat(e.target.value))}
                      className="flex-1 accent-emerald-500"
                    />
                  </div>
                </div>
                {tooLong && (
                  <p className="text-[11px] text-red-400 mt-1">Máximo {Math.floor(maxDuration / 60)}min — encurte o corte.</p>
                )}
              </div>

              {/* Filtros */}
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-white/70" />
                  <span className="text-[11px] text-white/70 font-semibold uppercase tracking-widest">Filtro</span>
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: 'thin' }}>
                  {FILTERS.map(f => {
                    const active = f.key === filter.key;
                    return (
                      <button
                        key={f.key}
                        onClick={() => setFilter(f)}
                        className="flex-shrink-0 px-3 h-8 rounded-full text-[11px] font-semibold transition-all"
                        style={{
                          background: active ? '#1e714a' : 'rgba(255,255,255,0.08)',
                          color: active ? '#fff' : 'rgba(255,255,255,0.85)',
                          border: `1px solid ${active ? '#1e714a' : 'rgba(255,255,255,0.12)'}`,
                        }}
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Renderer: aplica filtro + trim e devolve um novo File ──────────────────
// Usa canvas.captureStream() + MediaRecorder. Audio do vídeo entra via
// HTMLMediaElement.captureStream() (Chrome) ou MediaElementAudioSourceNode
// + AudioContext.createMediaStreamDestination() (Safari fallback).
async function renderEditedVideo(opts: {
  file: File;
  src: string;
  start: number;
  end: number;
  filterCss: string;
  onProgress: (pct: number) => void;
}): Promise<File> {
  const { file, src, start, end, filterCss, onProgress } = opts;
  // Se não tem trim nem filtro real, devolve original sem reprocessar
  const noTrim = start <= 0.01 && Math.abs(end - 0) < 0.01; // será corrigido abaixo
  const noFilter = filterCss === 'none' || !filterCss;

  // Detecta MediaRecorder + mimetype suportado
  const mime = pickMime();
  if (!mime || typeof MediaRecorder === 'undefined') {
    // Sem suporte — devolve original
    return file;
  }

  return new Promise<File>(async (resolve, reject) => {
    try {
      const video = document.createElement('video');
      video.src = src;
      video.crossOrigin = 'anonymous';
      video.muted = false; // precisa do audio na captureStream
      video.playsInline = true;
      // @ts-ignore — preload string
      video.preload = 'auto';
      await new Promise<void>((res, rej) => {
        video.onloadedmetadata = () => res();
        video.onerror = () => rej(new Error('Falha ao carregar vídeo no renderer'));
      });

      const realStart = Math.max(0, start);
      const realEnd = Math.min(video.duration || end, end);
      const duration = Math.max(0.1, realEnd - realStart);

      // Se não tem trim nem filtro, evita re-encode caro
      const finalNoTrim = realStart < 0.05 && Math.abs(realEnd - (video.duration || 0)) < 0.05;
      if (finalNoTrim && noFilter) {
        resolve(file);
        return;
      }

      const w = video.videoWidth || 720;
      const h = video.videoHeight || 1280;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D não disponível');

      // Captura stream do canvas (video) + audio do <video>
      const canvasStream = (canvas as HTMLCanvasElement).captureStream(30);
      let audioTracks: MediaStreamTrack[] = [];
      try {
        // captureStream do video element — Chrome/Firefox
        // @ts-ignore — captureStream existe em runtime
        const vs: MediaStream | undefined = (video as any).captureStream?.() || (video as any).mozCaptureStream?.();
        if (vs) audioTracks = vs.getAudioTracks();
      } catch {}
      if (audioTracks.length === 0) {
        // Safari fallback: WebAudio
        try {
          const ac = new AudioContext();
          const srcNode = ac.createMediaElementSource(video);
          const dest = ac.createMediaStreamDestination();
          srcNode.connect(dest);
          srcNode.connect(ac.destination); // pra não cortar audio do preview
          audioTracks = dest.stream.getAudioTracks();
        } catch (e) {
          // Sem audio então — segue só com video
        }
      }
      const combined = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...audioTracks,
      ]);

      const rec = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onerror = (e) => reject(new Error('MediaRecorder erro: ' + (e as any)?.error?.message));
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const out = new File([blob], `edited.${ext}`, { type: mime });
        resolve(out);
      };

      // Inicia: seek pro start, toca, desenha frame por frame com filtro
      video.currentTime = realStart;
      await new Promise<void>(r => { video.onseeked = () => r(); });

      rec.start(250);
      await video.play();

      const startTime = performance.now();
      let running = true;
      const draw = () => {
        if (!running) return;
        try {
          ctx.filter = filterCss || 'none';
          ctx.drawImage(video, 0, 0, w, h);
        } catch {}
        const elapsed = (performance.now() - startTime) / 1000;
        onProgress(Math.min(1, elapsed / duration));
        if (video.currentTime >= realEnd - 0.05 || video.ended) {
          running = false;
          video.pause();
          // Pequeno delay pra MediaRecorder flushar o último frame
          setTimeout(() => {
            try { rec.stop(); } catch {}
          }, 120);
          return;
        }
        requestAnimationFrame(draw);
      };
      requestAnimationFrame(draw);

      // Safety timeout — se nada terminar em 2x duração, força stop
      setTimeout(() => {
        if (running) {
          running = false;
          try { rec.stop(); } catch {}
        }
      }, duration * 1000 * 2 + 5000);
    } catch (e) {
      reject(e as Error);
    }
  });
}

function pickMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'video/mp4;codecs=avc1.42E01E,mp4a.40.2',  // iOS 17+
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}
