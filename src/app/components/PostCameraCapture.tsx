// Camera viewfinder live (estilo Instagram) acionada pelo botao "Postar".
// Substitui o fluxo antigo que abria um file picker simples — agora o user
// ve a camera ao vivo e tira a foto na hora, ou pode acessar a galeria
// pelo icone no canto inferior esquerdo.
//
// Suporte:
//   - getUserMedia (camera live) com switch front/back
//   - Botao central: captura foto (canvas snapshot)
//   - Long-press no botao central: grava video (max 60s no feed)
//   - Icone galeria: abre file picker (foto OU video)
//   - X pra fechar
//
// Fallback: se o navegador nao suporta getUserMedia ou usuario nega a
// permissao, mostra mensagem + botao "Abrir galeria" pra nao bloquear.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Image as ImageIcon, RefreshCcw, AlertTriangle } from 'lucide-react';

interface Props {
  /** Chamado quando o user pega/grava ou seleciona um arquivo. */
  onCapture: (file: File) => void;
  /** Chamado quando o user fecha sem escolher nada. */
  onCancel: () => void;
}

export function PostCameraCapture({ onCapture, onCancel }: Props) {
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
  const MAX_REC_SECONDS = 60;

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

  // Inicia / re-inicia a stream da camera. Se trocar facing, para a stream
  // anterior e abre nova com o novo facingMode.
  useEffect(() => {
    let cancelled = false;
    async function start() {
      setPermErr(null);
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Esse navegador nao suporta camera. Use a galeria.');
        }
        // Para qualquer stream anterior antes de pedir nova
        if (streamRef.current) {
          for (const t of streamRef.current.getTracks()) t.stop();
          streamRef.current = null;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true, // necessario pra gravar video com som
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
        // Permissao negada / camera ocupada / nao disponivel
        setPermErr(
          msg.includes('denied') || msg.includes('NotAllowed')
            ? 'Permissao da camera negada. Habilite nas configuracoes do navegador ou use a galeria.'
            : msg.includes('NotFound') || msg.includes('not found')
              ? 'Nenhuma camera encontrada nesse dispositivo. Use a galeria.'
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

  // Cleanup do timer/recorder ao desmontar
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
    // Espelha horizontalmente quando eh camera frontal (selfie) — UX padrao
    // de qualquer app de camera. Sem isso fica espelhado ao salvar.
    if (facing === 'user') {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(v, 0, 0, w, h);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `post-${Date.now()}.jpg`, { type: 'image/jpeg' });
      onCapture(file);
    }, 'image/jpeg', 0.92);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || recorderRef.current) return;
    recordChunks.current = [];
    // Tenta mp4; se nao suportar, cai pra webm (Chrome desktop).
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';
    try {
      const rec = new MediaRecorder(stream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(recordChunks.current, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const file = new File([blob], `post-${Date.now()}.${ext}`, { type: mime });
        recordChunks.current = [];
        recorderRef.current = null;
        if (file.size > 0) onCapture(file);
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
      console.error('[CameraCapture] startRecording failed', e);
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

  // Press: agenda inicio de gravacao apos 350ms (long-press). Release antes
  // disso = foto. Release depois disso = para gravacao.
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
      // Foi tap rapido — tira foto
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
    if (f) onCapture(f);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex flex-col"
      style={{ background: '#000', touchAction: 'none' }}
    >
      {/* Video viewfinder ocupando a tela toda. mirror quando camera
          frontal (estilo selfie). */}
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
        {/* Top bar — X pra fechar */}
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
            aria-label="Fechar camera"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {/* Timer de gravacao */}
          {recording && (
            <div
              className="px-3 py-1.5 rounded-full flex items-center gap-2 font-mono text-sm font-bold text-white"
              style={{ background: 'rgba(220,38,38,0.9)' }}
            >
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {Math.floor(recordSeconds).toString().padStart(2, '0')}:
              {Math.floor((recordSeconds % 1) * 10)}s
            </div>
          )}

          <div className="w-10" />
        </div>

        {/* Spacer central */}
        <div className="flex-1 flex items-center justify-center">
          {permErr && (
            <div className="mx-6 px-5 py-4 rounded-2xl text-center text-white" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
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

        {/* Bottom controls: galeria | botao captura | flip camera */}
        <div
          className="flex items-center justify-around px-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', paddingTop: 16 }}
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

          {/* Botao captura */}
          <button
            type="button"
            onPointerDown={onCaptureBtnDown}
            onPointerUp={onCaptureBtnUp}
            onPointerCancel={onCaptureBtnUp}
            className="relative flex items-center justify-center"
            style={{ width: 78, height: 78, touchAction: 'none' }}
            aria-label={recording ? 'Parar gravacao' : 'Tirar foto (segure pra gravar)'}
          >
            {/* Anel externo */}
            <span
              className="absolute inset-0 rounded-full"
              style={{ border: `4px solid ${recording ? '#dc2626' : '#ffffff'}` }}
            />
            {/* Bola interna — vira quadrado vermelho enquanto grava */}
            <span
              style={{
                width: recording ? 28 : 62,
                height: recording ? 28 : 62,
                borderRadius: recording ? 6 : '50%',
                background: recording ? '#dc2626' : '#ffffff',
                transition: 'all 180ms ease-out',
              }}
            />
          </button>

          {/* Flip camera */}
          <button
            type="button"
            onClick={flipCamera}
            className="w-12 h-12 rounded-2xl flex items-center justify-center active:scale-95 disabled:opacity-50"
            style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)' }}
            disabled={!!permErr || recording}
            aria-label="Trocar camera"
          >
            <RefreshCcw className="w-6 h-6 text-white" />
          </button>
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
