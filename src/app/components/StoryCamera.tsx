// Camera viewfinder em tela cheia, estilo Instagram, pro fluxo de POSTAR STORY.
// Acionada quando o user toca no proprio circulo de story (com "+") na barra
// de stories do feed. Substitui o menu antigo (Tirar foto / Gravar video /
// Galeria) — agora abre direto pra camera ao vivo.
//
// Comportamento:
//   - Tap rapido no botao central -> tira foto (jpeg)
//   - Press + hold -> grava video (max 30s; anel de progresso ao redor do botao)
//   - Canto sup esq: X (cancela)
//   - Canto sup dir: trocar camera frontal/traseira
//   - Canto inf esq: icone galeria -> file picker (foto+video do device)
//   - Texto inferior: "História" (modo padrao; espacador pra UX futura
//     de Reel/Live, se implementarmos)
//
// Permissoes: pedidas so na primeira vez via getUserMedia. Se negada, mostra
// fallback com botao "Abrir galeria" pra nao bloquear o user.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, RefreshCcw, AlertTriangle } from 'lucide-react';

interface Props {
  /** Disparado quando o user captura ou seleciona uma midia.
   *  kind eh determinado pelo MIME do arquivo retornado. */
  onCapture: (file: File, kind: 'image' | 'video') => void;
  onCancel: () => void;
}

const MAX_REC_SECONDS = 30;

export function StoryCamera({ onCapture, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef<number>(0);

  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [permErr, setPermErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  // Trava o scroll do body enquanto a camera esta aberta
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prev.html;
      body.style.overflow = prev.body;
    };
  }, []);

  // Inicia/re-inicia a stream da camera ao trocar facing
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setPermErr(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Esse navegador nao suporta camera. Use a galeria.');
        }
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* iOS pode falhar autoplay; ok */ });
        }
      } catch (e: any) {
        if (cancelled) return;
        const msg = e?.message || String(e);
        setPermErr(
          msg.includes('denied') || msg.includes('NotAllowed')
            ? 'Permissão da câmera negada. Habilite nas configurações do navegador ou use a galeria.'
            : msg.includes('NotFound') || msg.includes('not found')
              ? 'Nenhuma câmera encontrada nesse dispositivo. Use a galeria.'
              : msg
        );
      }
    }
    start();
    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) {
        for (const t of s.getTracks()) t.stop();
        streamRef.current = null;
      }
    };
  }, [facing]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      const r = recorderRef.current;
      if (r && r.state !== 'inactive') {
        try { r.stop(); } catch {}
      }
    };
  }, []);

  function flipCamera() {
    if (recording) return;
    setFacing(f => (f === 'user' ? 'environment' : 'user'));
  }

  function snapPhoto() {
    const v = videoRef.current;
    if (!v) return;
    const w = v.videoWidth;
    const h = v.videoHeight;
    if (!w || !h) return;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file, 'image');
    }, 'image/jpeg', 0.92);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    recordChunks.current = [];
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunks.current, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `story-${Date.now()}.${ext}`, { type: mime });
        recordChunks.current = [];
        recorderRef.current = null;
        if (file.size > 0) onCapture(file, 'video');
      };
      rec.start();
      recorderRef.current = rec;
      recordStartRef.current = Date.now();
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => {
        const elapsed = (Date.now() - recordStartRef.current) / 1000;
        setRecordSeconds(elapsed);
        if (elapsed >= MAX_REC_SECONDS) stopRecording();
      }, 100);
    } catch (e) {
      console.error('[StoryCamera] startRecording failed', e);
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      try { r.stop(); } catch {}
    }
  }

  function onCaptureBtnDown(e: React.PointerEvent) {
    e.preventDefault();
    if (recording) return;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startRecording();
    }, 350);
  }
  function onCaptureBtnUp(e: React.PointerEvent) {
    e.preventDefault();
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
      snapPhoto();
      return;
    }
    if (recording) stopRecording();
  }

  function openGallery() {
    const el = galleryRef.current;
    if (!el) return;
    el.value = '';
    el.click();
  }

  function handleGalleryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const kind: 'image' | 'video' = f.type.startsWith('video/') ? 'video' : 'image';
    onCapture(f, kind);
  }

  const recordPct = Math.min(1, recordSeconds / MAX_REC_SECONDS);
  // Calculo do strokeDashoffset pro anel de progresso (raio 38, circ ~239)
  const ringRadius = 38;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - recordPct);

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex flex-col"
      style={{ background: '#000', touchAction: 'none' }}
    >
      {/* Video viewfinder fullscreen, espelhado quando camera frontal */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: facing === 'user' ? 'scaleX(-1)' : 'none',
        }}
      />

      {/* Overlay com controles */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top bar */}
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            aria-label="Fechar câmera"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          <button
            type="button"
            onClick={flipCamera}
            disabled={!!permErr || recording}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-40"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            aria-label="Trocar câmera"
          >
            <RefreshCcw className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Spacer central — mostra fallback se permissao negada */}
        <div className="flex-1 flex items-center justify-center">
          {permErr && (
            <div
              className="mx-6 px-5 py-4 rounded-2xl text-center text-white"
              style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
            >
              <AlertTriangle className="w-7 h-7 mx-auto mb-2 text-yellow-400" />
              <p className="text-sm mb-3">{permErr}</p>
              <button
                type="button"
                onClick={openGallery}
                className="px-4 py-2 rounded-full font-semibold text-sm bg-white text-black"
              >
                Abrir galeria
              </button>
            </div>
          )}
        </div>

        {/* Bottom controls: galeria | botao captura | spacer (mantem alinhamento) */}
        <div
          className="flex items-center justify-around px-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', paddingTop: 8 }}
        >
          {/* Galeria */}
          <button
            type="button"
            onClick={openGallery}
            className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95"
            style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
            aria-label="Abrir galeria"
          >
            <ImageIcon className="w-6 h-6 text-white" />
          </button>

          {/* Botao captura com anel de progresso */}
          <button
            type="button"
            onPointerDown={onCaptureBtnDown}
            onPointerUp={onCaptureBtnUp}
            onPointerCancel={onCaptureBtnUp}
            className="relative flex items-center justify-center"
            style={{ width: 84, height: 84, touchAction: 'none' }}
            aria-label={recording ? 'Parar gravação' : 'Tirar foto (segure pra gravar)'}
          >
            {/* Anel externo (estatico — branco) + progresso (vermelho) por cima */}
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: '4px solid rgba(255,255,255,0.85)' }}
            />
            {recording && (
              <svg
                className="absolute inset-0"
                width={84}
                height={84}
                viewBox="0 0 84 84"
                style={{ transform: 'rotate(-90deg)' }}
              >
                <circle
                  cx={42}
                  cy={42}
                  r={ringRadius}
                  fill="none"
                  stroke="#dc2626"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringOffset}
                  style={{ transition: 'stroke-dashoffset 100ms linear' }}
                />
              </svg>
            )}
            {/* Bola interna — vira quadrado vermelho ao gravar */}
            <span
              style={{
                width: recording ? 30 : 66,
                height: recording ? 30 : 66,
                borderRadius: recording ? 6 : '50%',
                background: recording ? '#dc2626' : '#ffffff',
                transition: 'all 180ms ease-out',
              }}
            />
          </button>

          {/* Spacer pra equilibrar o layout (galeria a esquerda, vazio aqui) */}
          <div className="w-12 h-12" />
        </div>

        {/* Label "História" (estilo IG) — pra hint do modo atual */}
        <div
          className="text-center pb-2"
          style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <span
            className="text-white/85 text-xs font-bold uppercase tracking-widest"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif', letterSpacing: '0.18em' }}
          >
            História
          </span>
        </div>
      </div>

      {/* Input invisivel pra galeria */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime,video/x-m4v,video/3gpp,video/webm,video/*"
        onChange={handleGalleryChange}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>,
    document.body,
  );
}
