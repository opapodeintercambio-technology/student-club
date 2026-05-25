// Camera viewfinder em tela cheia, estilo Instagram, pro fluxo UNIFICADO de
// POSTAR (Feed ou Story). Acionada por:
//   - Toque no proprio circulo "Seu story" (default mode = 'story')
//   - Botao "Post" da bottom nav (default mode = 'feed')
//   - Swipe horizontal no feed (default mode = 'feed')
//
// Tabs INFERIORES (POST | STORY) permitem o user trocar de modo no proprio
// viewfinder, igual o Instagram. Tambem aceita swipe horizontal pra alternar.
//
// Comportamento:
//   - Tap rapido no botao central -> tira foto (jpeg)
//   - Press + hold -> grava video (max 30s; anel de progresso ao redor do botao)
//   - Canto sup esq: Flash on/off (torch via track constraints quando suportado)
//   - Canto sup dir: trocar camera frontal/traseira
//   - Canto inf esq: icone galeria -> file picker (foto+video do device)
//   - Swipe-down pra fechar (sem botao X)
//   - Tabs POST | STORY no rodape — tap ou swipe lateral pra alternar
//
// Permissoes: pedidas so na primeira vez via getUserMedia. Se negada, mostra
// fallback com botao "Abrir galeria" pra nao bloquear o user.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Image as ImageIcon, RefreshCcw, AlertTriangle, Zap, ZapOff } from 'lucide-react';
import { useLockBodyScroll } from '../hooks/useLockBodyScroll';
import { StoryCameraFilters, FILTER_NONE, type CameraFilter } from './StoryCameraFilters';

export type PostCameraMode = 'feed' | 'story';

interface Props {
  /** Disparado quando o user captura ou seleciona uma midia.
   *  - kind: determinado pelo MIME do arquivo retornado
   *  - mode: qual tab estava ativa no momento da captura (feed ou story) */
  onCapture: (file: File, kind: 'image' | 'video', mode: PostCameraMode) => void;
  onCancel: () => void;
  /** Tab selecionada por default ao abrir a camera. User pode trocar via UI. */
  defaultMode?: PostCameraMode;
  /** Quando setado, o modo eh travado nesse valor e as tabs POST/STORY
   *  no rodape SOMEM. Usado pelo "+" badge de stories — entrada dedicada
   *  pra postar story, sem chance do user trocar pra modo post.
   *  - undefined → tabs visiveis, user troca livremente
   *  - 'story'   → so postar story, sem tabs
   *  - 'feed'    → so postar feed, sem tabs (nao usado atualmente)
   */
  lockedMode?: PostCameraMode;
}

const MAX_REC_SECONDS = 30;

export function StoryCamera({ onCapture, onCancel, defaultMode = 'story', lockedMode }: Props) {
  // Trava o scroll do body via useLockBodyScroll (token-based, robusto).
  // Antes usavamos lock local (style.overflow direto), que podia corromper
  // o estado restaurado quando StoryEditor montava em sequencia.
  useLockBodyScroll(true);

  // Modo selecionado nas tabs inferiores. Define pra onde vai a midia
  // capturada (feed composer vs story editor). Quando lockedMode esta
  // setado, ignora o setMode (tabs nao aparecem).
  const initialMode: PostCameraMode = lockedMode ?? defaultMode;
  const [mode, setMode] = useState<PostCameraMode>(initialMode);
  // Re-sincroniza se a prop default mudar (ex: parent reabre camera em
  // outro modo sem desmontar).
  useEffect(() => { setMode(lockedMode ?? defaultMode); }, [defaultMode, lockedMode]);
  const modeRef = useRef<PostCameraMode>(initialMode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  // Flash state. Implementado via track.applyConstraints({ torch }) — so
  // funciona em Chromium/Android. iOS Safari nao expoe torch via web.
  // Em dispositivos sem suporte mostramos um toast e ignoramos.
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState<boolean | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStartRef = useRef<number>(0);
  // Coordenada Y inicial do toque/clique no botao captura. Usada pro
  // gesto arrastar-pra-cima/baixo = ZOOM durante a gravacao (estilo IG).
  // Reseta no pointer up.
  const captureStartYRef = useRef<number>(0);

  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [permErr, setPermErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  // Zoom digital da preview do video. 1 = sem zoom, 4 = zoom maximo (4x).
  // Aplicado via CSS scale no <video> (digital zoom — qualidade cai mas
  // funciona em qualquer browser, ao contrario de track.applyConstraints).
  // Tambem queimado no canvas/MediaRecorder pra que a gravacao tenha o
  // mesmo enquadramento que o user viu.
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  // FILTRO DE IMAGEM — estilo Instagram. 20 filtros (10 fun + 10 beauty)
  // + 'none'. CSS `filter` aplicado no <video> da preview E no ctx.filter
  // do canvas que captura/grava — assim a foto/video SALVOS tem o mesmo
  // look que o user viu. O filtro fica "queimado" na midia final.
  const [activeFilter, setActiveFilter] = useState<CameraFilter>(FILTER_NONE);
  const activeFilterRef = useRef<CameraFilter>(FILTER_NONE);
  useEffect(() => { activeFilterRef.current = activeFilter; }, [activeFilter]);

  // SWIPE-DOWN-TO-CLOSE: user arrasta a tela pra baixo pra sair da camera.
  // SWIPE-LATERAL-TO-SWITCH-MODE: arrasta pros lados pra alternar POST/STORY.
  // Thresholds:
  //   - Vertical: 70px (lowered de 120) OU velocity > 0.5px/ms = fecha
  //   - Horizontal: 60px = troca tab
  // Tambem registramos o startTime pra calcular velocidade.
  const [swipeY, setSwipeY] = useState(0);
  const swipeRef = useRef<{
    startY: number;
    startX: number;
    startT: number;
    /** Direcao confirmada apos o threshold inicial; null = ainda candidato */
    dir: null | 'vertical' | 'horizontal';
  } | null>(null);

  // Avisa o resto da app que a camera esta aberta — App.tsx desabilita PTR
  // (pull-to-refresh) enquanto isso, pra nao conflitar com o swipe-down-to-close.
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('papo-camera-state', { detail: { open: true } }));
    return () => {
      window.dispatchEvent(new CustomEvent('papo-camera-state', { detail: { open: false } }));
    };
  }, []);

  // PINCH-ZOOM no viewfinder: pinca com 2 dedos pra zoom in/out na preview
  // (alem do drag vertical durante a gravacao). Detectado manualmente via
  // TouchEvent.
  const pinchRef = useRef<{ startDist: number; baseZoom: number } | null>(null);

  // hasRenderedFrameRef: vira true SO depois que o primeiro frame de
  // video foi de fato APRESENTADO pra renderizacao (via rVFC). Sem isso,
  // o fast-path do snapPhoto chamava doSnap quando readyState>=2 + dims>0,
  // mas o frame ainda nao tinha sido decodificado pra render — ctx.drawImage
  // capturava buffer vazio → JPEG invalido → "tela preta" no crop → user
  // achava que precisava tirar 2 fotos.
  // Reseta quando a stream muda (troca de camera).
  const hasRenderedFrameRef = useRef(false);

  // (Removido: lock local de body overflow. Foi substituido pelo hook
  // useLockBodyScroll no topo do componente — token-based, evita race
  // de prev-state corrompido quando StoryEditor montava em sequencia.)

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
        // Nova stream → ainda nao foi apresentado nenhum frame pra render.
        // Marca como false ate o primeiro rVFC (ou onPlaying como fallback)
        // disparar. snapPhoto vai bloquear o fast-path enquanto isso.
        hasRenderedFrameRef.current = false;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { /* iOS pode falhar autoplay; ok */ });
          // Registra deteccao de PRIMEIRO FRAME apresentado.
          // rVFC eh o caminho mais preciso (iOS 15.4+, Chrome 83+).
          // Fallback: 'playing' event eh disparado quando o video efetivamente
          // ta tocando (frame chegou). Usamos {once:true} no listener.
          const v = videoRef.current;
          const vAny = v as any;
          // Quando o primeiro frame for apresentado, marca como pronto E
          // consome qualquer intent de snap pendente (user clicou antes
          // do video carregar — fonte do bug do "preciso tirar 2 fotos").
          const consumePending = async () => {
            hasRenderedFrameRef.current = true;
            if (!pendingSnapRef.current) return;
            pendingSnapRef.current = false;
            // Retry com pequeno delay pra garantir frame decodificado.
            for (let i = 0; i < 4; i++) {
              await new Promise(r => setTimeout(r, i === 0 ? 80 : 120));
              const ok = await doSnap();
              if (ok) return;
            }
            console.warn('[StoryCamera] pending snap falhou apos 4 tentativas');
          };
          if (typeof vAny.requestVideoFrameCallback === 'function') {
            vAny.requestVideoFrameCallback(() => { void consumePending(); });
          } else {
            v.addEventListener('playing', () => { void consumePending(); }, { once: true });
            v.addEventListener('loadeddata', () => { void consumePending(); }, { once: true });
          }
        }
        // Detecta se a faixa de video suporta torch (flash). Em iOS Safari
        // capabilities.torch nao existe — escondemos o botao nesse caso.
        try {
          const track = stream.getVideoTracks?.()[0];
          const caps = (track?.getCapabilities?.() ?? {}) as any;
          setFlashSupported(!!caps.torch);
        } catch { setFlashSupported(false); }
        // Reseta o flash quando trocamos de camera (nova stream = sem torch)
        setFlashOn(false);
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
      if (filterRafRef.current != null) {
        cancelAnimationFrame(filterRafRef.current);
        filterRafRef.current = null;
      }
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

  // Liga/desliga o flash (torch). So funciona em browsers/devices com
  // suporte a constraint torch (Chromium/Android). iOS Safari nao expoe —
  // nesse caso o botao fica escondido pelo render (flashSupported = false).
  async function toggleFlash() {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks?.()[0];
    if (!track) return;
    const caps = (track.getCapabilities?.() ?? {}) as any;
    if (!caps.torch) {
      setFlashSupported(false);
      return;
    }
    try {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setFlashOn(next);
    } catch (e) {
      console.error('[StoryCamera] toggleFlash', e);
    }
  }

  // Captura a foto. Garante que o <video> tenha um FRAME REAL APRESENTADO
  // antes de desenhar no canvas. Sem isso o primeiro tap rapido apos abrir
  // a camera gerava JPEG vazio (readyState ja era 2 mas o frame ainda nao
  // tinha sido compositado — drawImage capturava buffer transparente).
  //
  // Fast path so eh usado depois que hasRenderedFrameRef.current = true
  // (ja vimos pelo menos um rVFC ou onPlaying). Antes disso, ESPERA.
  // Estado pra suportar "intent de captura pendente" quando o user clica
  // ANTES do video estar pronto. O effect que sobe a stream consome esse
  // intent assim que o primeiro frame for renderizado (rVFC/playing) —
  // sem polling.
  const pendingSnapRef = useRef(false);

  function snapPhoto() {
    const v = videoRef.current;
    if (!v) return;

    const isReady = () =>
      v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0;

    if (v.paused) {
      v.play().catch(() => { /* ok */ });
    }

    // Faz UMA tentativa de captura agora; se o blob sair vazio (frame
    // ainda nao renderizado), agenda retry baseado em EVENTO de video,
    // nao em polling. Maximo 4 retries, totalizando ate ~5s de espera.
    let attempts = 0;
    const MAX_ATTEMPTS = 4;

    const tryNow = async () => {
      if (!isReady()) {
        // Video ainda nao tem readyState/dims. Marca intent pendente —
        // sera consumido pelo listener 'loadeddata'/'playing'/rVFC.
        pendingSnapRef.current = true;
        // Um fallback bem mais longo (5s) caso nenhum evento dispare.
        setTimeout(() => {
          if (pendingSnapRef.current && isReady()) {
            pendingSnapRef.current = false;
            void doSnap();
          }
        }, 5000);
        return;
      }
      const ok = await doSnap();
      if (ok) {
        hasRenderedFrameRef.current = true;
        return;
      }
      attempts++;
      if (attempts >= MAX_ATTEMPTS) {
        console.warn('[StoryCamera] doSnap falhou apos retries — desistindo');
        return;
      }
      // Frame ficou preto/invalido: agenda retry no proximo frame de
      // video apresentado (rVFC eh o sinal MAIS preciso).
      const vAny = v as any;
      if (typeof vAny.requestVideoFrameCallback === 'function') {
        vAny.requestVideoFrameCallback(() => { void tryNow(); });
      } else {
        // Sem rVFC: usa rAF + pequeno delay
        requestAnimationFrame(() => setTimeout(() => { void tryNow(); }, 16));
      }
    };

    void tryNow();
  }

  // doSnap retorna Promise<boolean> indicando sucesso (true = foto valida
  // enviada via onCapture; false = frame ainda nao pronto, blob invalido,
  // ou erro de drawImage). Chamadores fazem retry quando recebe false.
  // BUG ANTERIOR: se o blob saia invalido (<100 bytes — frame vazio comum
  // no primeiro tap apos abrir a camera em iOS), doSnap retornava silencio
  // — user achava que clicou e nada acontecia, e tirava 2 fotos.
  function doSnap(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const v = videoRef.current;
      if (!v) return resolve(false);
      let w = v.videoWidth;
      let h = v.videoHeight;
      if (!w || !h) {
        const track = streamRef.current?.getVideoTracks?.()[0];
        const settings = track?.getSettings?.();
        w = (settings?.width as number) || 1080;
        h = (settings?.height as number) || 1920;
      }
      if (!w || !h) return resolve(false);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(false);
      const z = zoomRef.current || 1;
      // QUEIMA o filtro CSS no canvas — assim a foto SALVA fica com o
      // mesmo look que o user viu na preview. ctx.filter suporta a mesma
      // sintaxe de CSS filter strings (brightness, contrast, etc).
      // Fallback pra 'none' se nao suportado pelo browser.
      const filterCss = activeFilterRef.current?.cssFilter || 'none';
      try {
        (ctx as any).filter = filterCss;
      } catch { /* alguns browsers antigos nao tem ctx.filter — segue sem */ }
      try {
        if (z > 1) {
          const cropW = w / z;
          const cropH = h / z;
          const sx = (w - cropW) / 2;
          const sy = (h - cropH) / 2;
          if (facing === 'user') {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, w, h);
        } else {
          if (facing === 'user') {
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
          }
          ctx.drawImage(v, 0, 0, w, h);
        }
      } catch (err) {
        console.error('[StoryCamera] drawImage failed', err);
        return resolve(false);
      }
      // Threshold elevado de 100 → 2000 bytes: blob "preto" de 1080x1920
      // costuma sair ~1-2KB. < 2000 = frame quase certamente invalido.
      canvas.toBlob(blob => {
        if (!blob || blob.size < 2000) {
          console.warn('[StoryCamera] blob invalido (size=', blob?.size, ') — retentando');
          return resolve(false);
        }
        const m = modeRef.current;
        const prefix = m === 'feed' ? 'post' : 'story';
        const file = new File([blob], `${prefix}-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file, 'image', m);
        return resolve(true);
      }, 'image/jpeg', 0.92);
    });
  }

  // Canvas + rAF loop pra "queimar" filtro no video gravado.
  // Quando filtro != none, criamos um canvas intermediario que renderiza
  // cada frame do video com ctx.filter aplicado, e usamos canvas.captureStream()
  // pra alimentar o MediaRecorder. Audio vem do stream original.
  // Quando filtro == none, gravamos o stream original direto (mais leve).
  const filterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const filterRafRef = useRef<number | null>(null);

  function startRecording() {
    const stream = streamRef.current;
    const v = videoRef.current;
    if (!stream || !v || recorderRef.current) return;
    recordChunks.current = [];
    const mime = MediaRecorder.isTypeSupported('video/mp4') ? 'video/mp4'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus'
      : 'video/webm';

    // Decide stream final: filtrado (via canvas) ou direto (raw).
    let recordStream: MediaStream = stream;
    const filterCss = activeFilterRef.current?.cssFilter || 'none';
    const needsFilter = filterCss !== 'none' && filterCss !== '';

    if (needsFilter) {
      try {
        // Dimensoes do canvas baseadas no video atual
        const w = v.videoWidth || 1080;
        const h = v.videoHeight || 1920;
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Pinta cada frame com filtro queimado
          const drawLoop = () => {
            if (!ctx || !v || v.readyState < 2) {
              filterRafRef.current = requestAnimationFrame(drawLoop);
              return;
            }
            try {
              (ctx as any).filter = filterCss;
              const z = zoomRef.current || 1;
              ctx.save();
              if (z > 1) {
                const cropW = w / z;
                const cropH = h / z;
                const sx = (w - cropW) / 2;
                const sy = (h - cropH) / 2;
                if (facing === 'user') {
                  ctx.translate(w, 0);
                  ctx.scale(-1, 1);
                }
                ctx.drawImage(v, sx, sy, cropW, cropH, 0, 0, w, h);
              } else {
                if (facing === 'user') {
                  ctx.translate(w, 0);
                  ctx.scale(-1, 1);
                }
                ctx.drawImage(v, 0, 0, w, h);
              }
              ctx.restore();
            } catch {}
            filterRafRef.current = requestAnimationFrame(drawLoop);
          };
          drawLoop();
          filterCanvasRef.current = canvas;

          // captureStream() pega o canvas como MediaStream de video.
          // Combinamos com o audio do stream original (mantem som).
          const fps = 30;
          const canvasStream = (canvas as any).captureStream?.(fps) as MediaStream | undefined;
          if (canvasStream) {
            const audioTracks = stream.getAudioTracks();
            // Adiciona audio do mic ao canvas stream
            for (const at of audioTracks) {
              canvasStream.addTrack(at);
            }
            recordStream = canvasStream;
          }
        }
      } catch (e) {
        // Fallback: grava sem filtro. Melhor que nada gravar.
        console.warn('[StoryCamera] canvas filter recording failed, fallback raw:', e);
      }
    }

    try {
      const rec = new MediaRecorder(recordStream, { mimeType: mime });
      rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordChunks.current.push(e.data); };
      rec.onstop = () => {
        // Encerra o rAF do filtro
        if (filterRafRef.current != null) {
          cancelAnimationFrame(filterRafRef.current);
          filterRafRef.current = null;
        }
        filterCanvasRef.current = null;
        const blob = new Blob(recordChunks.current, { type: mime });
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const m = modeRef.current;
        const prefix = m === 'feed' ? 'post' : 'story';
        const file = new File([blob], `${prefix}-${Date.now()}.${ext}`, { type: mime });
        recordChunks.current = [];
        recorderRef.current = null;
        if (file.size > 0) onCapture(file, 'video', m);
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
      // Cleanup do rAF caso tenhamos começado o loop
      if (filterRafRef.current != null) {
        cancelAnimationFrame(filterRafRef.current);
        filterRafRef.current = null;
      }
    }
  }

  function stopRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    setRecording(false);
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') {
      try { r.stop(); } catch {}
    }
    // Reseta zoom ao fim da gravacao — proxima sessao comeca em 1x.
    setZoom(1);
  }

  /** Aplica zoom via hardware quando suportado (camera physical zoom), com
   *  fallback pra CSS scale. Tenta os dois — alguns dispositivos suportam
   *  o constraint mas com range pequeno; CSS complementa. */
  function applyZoomToTrack(value: number) {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks?.()[0];
    if (!track) return;
    try {
      const caps = (track.getCapabilities?.() ?? {}) as any;
      if (caps && typeof caps.zoom === 'object' && caps.zoom != null) {
        const min = caps.zoom.min ?? 1;
        const max = caps.zoom.max ?? 1;
        if (max > min) {
          const mapped = min + ((value - 1) / 3) * (max - min);
          const clamped = Math.max(min, Math.min(max, mapped));
          track.applyConstraints({ advanced: [{ zoom: clamped } as any] }).catch(() => {});
        }
      }
    } catch { /* navegador sem suporte — CSS scale cobre */ }
  }

  function onCaptureBtnDown(e: React.PointerEvent) {
    e.preventDefault();
    if (recording) return;
    // Captura O POINTER no botao — eventos subsequentes (move/up) continuam
    // chegando aqui mesmo quando o dedo do user sai do botao (essencial pro
    // gesto de arrastar pra cima/baixo durante a gravacao = zoom).
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch {}
    captureStartYRef.current = e.clientY;
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = setTimeout(() => {
      holdTimerRef.current = null;
      startRecording();
    }, 350);
  }

  function onCaptureBtnMove(e: React.PointerEvent) {
    if (!recording) return;
    // Y delta: NEGATIVO = arrastou pra CIMA (zoom in), POSITIVO = pra baixo (out)
    const dy = e.clientY - captureStartYRef.current;
    // 250px = 4x. Linear, clamped em [1, 4]. Tornou-se conveniente:
    // segurar e levantar uns 5cm da posicao inicial = zoom maximo.
    const next = Math.max(1, Math.min(4, 1 - dy / 250));
    setZoom(next);
    applyZoomToTrack(next);
  }

  function onCaptureBtnUp(e: React.PointerEvent) {
    e.preventDefault();
    try { (e.currentTarget as Element).releasePointerCapture?.(e.pointerId); } catch {}
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
    onCapture(f, kind, modeRef.current);
  }

  const recordPct = Math.min(1, recordSeconds / MAX_REC_SECONDS);
  // Calculo do strokeDashoffset pro anel de progresso (raio 38, circ ~239)
  const ringRadius = 38;
  const ringCirc = 2 * Math.PI * ringRadius;
  const ringOffset = ringCirc * (1 - recordPct);

  // ─── Handlers de TouchEvent no viewfinder ─────────────────────────
  // Coexistem com o capture button (que tem setPointerCapture e nao
  // deixa eventos vazarem). Tratam:
  //   - 1 dedo arrastando pra baixo = swipe-down pra fechar
  //   - 2 dedos = pinch zoom
  function onViewerTouchStart(e: React.TouchEvent) {
    if (recording) return; // durante gravacao, zoom eh via drag do botao
    if (e.touches.length === 2) {
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      pinchRef.current = {
        startDist: Math.hypot(dx, dy),
        baseZoom: zoom,
      };
      swipeRef.current = null; // pinch cancela swipe candidato
      return;
    }
    if (e.touches.length === 1) {
      swipeRef.current = {
        startY: e.touches[0].clientY,
        startX: e.touches[0].clientX,
        startT: Date.now(),
        dir: null,
      };
    }
  }
  function onViewerTouchMove(e: React.TouchEvent) {
    if (recording) return;
    // Pinch (2 dedos) tem prioridade
    if (e.touches.length === 2 && pinchRef.current) {
      if (e.cancelable) e.preventDefault();
      const t1 = e.touches[0], t2 = e.touches[1];
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      const dist = Math.hypot(dx, dy);
      const ratio = dist / pinchRef.current.startDist;
      const newZoom = Math.max(1, Math.min(4, pinchRef.current.baseZoom * ratio));
      setZoom(newZoom);
      applyZoomToTrack(newZoom);
      return;
    }
    // Swipe (1 dedo) — primeiro identifica direcao (vert vs horiz) e depois
    // segue só essa direcao ate o touchEnd.
    if (e.touches.length === 1 && swipeRef.current) {
      const dy = e.touches[0].clientY - swipeRef.current.startY;
      const dx = e.touches[0].clientX - swipeRef.current.startX;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);
      // Direcao ainda nao confirmada — escolhe baseado em quem chegou no
      // threshold primeiro
      if (!swipeRef.current.dir) {
        if (ady > 20 && ady > adx) swipeRef.current.dir = 'vertical';
        else if (adx > 20 && adx > ady) swipeRef.current.dir = 'horizontal';
      }
      if (swipeRef.current.dir === 'vertical') {
        if (e.cancelable) e.preventDefault();
        // So swipe pra BAIXO eh visualmente refletido (translateY).
        // Pra cima ignoramos (poderia ser zoom mais tarde).
        setSwipeY(Math.max(0, dy));
      }
      // Horizontal nao precisa de feedback visual em tempo real — so commit
      // no touchEnd. (Evita "tremer" a UI a cada movimento de dedo.)
    }
  }
  function onViewerTouchEnd(e: React.TouchEvent) {
    if (e.touches.length < 2 && pinchRef.current) {
      pinchRef.current = null;
    }
    if (e.touches.length === 0) {
      const sw = swipeRef.current;
      swipeRef.current = null;
      if (sw?.dir === 'vertical') {
        // Fecha em duas situacoes:
        //   1) Arrastou >= 70px pra baixo (threshold absoluto)
        //   2) Velocidade > 0.5 px/ms E arrastou pelo menos 35px
        // Velocity-based threshold deixa o "flick" rapido sair da camera
        // imediatamente, sem precisar arrastar metade da tela.
        const t = e.changedTouches?.[0];
        const finalDy = t ? Math.max(0, t.clientY - sw.startY) : swipeY;
        const elapsed = Math.max(1, Date.now() - sw.startT);
        const velocity = finalDy / elapsed; // px/ms
        if (finalDy > 70 || (velocity > 0.5 && finalDy > 35)) {
          onCancel();
        } else {
          setSwipeY(0);
        }
      } else if (sw?.dir === 'horizontal') {
        const t = e.changedTouches?.[0];
        if (t && !lockedMode) {
          const dx = t.clientX - sw.startX;
          // EDGE-SWIPE pra VOLTAR PRO FEED: funciona em QUALQUER modo
          // (post ou story) — basta comecar o swipe nos ultimos 50px da
          // direita arrastando pra esquerda (dx < -60). Espelha o gesto
          // de "voltar" do iOS.
          const startedAtRightEdge = sw.startX >= (window.innerWidth - 50);
          if (startedAtRightEdge && dx < -60) {
            onCancel();
            return;
          }
          if (Math.abs(dx) > 60) {
            // Swipe pra ESQUERDA (dx negativo) → vai pra direita na ordem
            // dos modos. Ordem: [feed, story]. Swipe LEFT vai pra story;
            // RIGHT vai pra feed (que esta a esquerda).
            const order: PostCameraMode[] = ['feed', 'story'];
            const idx = order.indexOf(modeRef.current);
            const nextIdx = dx < 0 ? Math.min(order.length - 1, idx + 1) : Math.max(0, idx - 1);
            if (nextIdx !== idx) setMode(order[nextIdx]);
          }
        }
        setSwipeY(0);
      } else {
        setSwipeY(0);
      }
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100200] flex flex-col"
      style={{
        // Fade do backdrop conforme o user arrasta pra baixo
        background: `rgba(0,0,0,${Math.max(0.55, 1 - swipeY / 600)})`,
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
        // Translada o conteudo durante o swipe-down
        transform: swipeY > 0 ? `translateY(${swipeY}px)` : undefined,
        transition: swipeRef.current?.active ? 'none' : 'transform 220ms ease-out, background 200ms ease-out',
      } as React.CSSProperties}
      onTouchStart={onViewerTouchStart}
      onTouchMove={onViewerTouchMove}
      onTouchEnd={onViewerTouchEnd}
      onTouchCancel={onViewerTouchEnd}
    >
      {/* Video viewfinder fullscreen, espelhado quando camera frontal.
          O scale(zoom) eh aplicado AQUI pra dar feedback visual imediato
          do gesto de arrastar-pra-cima-pra-zoom. Se o hardware suporta
          track.applyConstraints({zoom}), ai a stream ja vem ampliada
          do device e o CSS scale eh sem efeito visual (porque ja esta
          em 100% do frame). Quando hardware nao suporta (caso comum em
          web), o CSS scale eh o que entrega o zoom (digital). */}
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
          transform: facing === 'user'
            ? `scaleX(-1) scale(${zoom})`
            : `scale(${zoom})`,
          transformOrigin: 'center center',
          transition: 'transform 60ms linear',
          // FILTRO ATIVO — aplicado tambem no canvas (doSnap) pra "queimar"
          // na foto/video final, nao so na preview.
          filter: activeFilter.cssFilter,
          WebkitFilter: activeFilter.cssFilter,
        } as React.CSSProperties}
      />

      {/* Overlay com controles */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Top bar — sem botao X (fechamento via swipe-down). Esquerda = flash;
            direita = flip camera. Estilo Instagram. */}
        <div
          className="flex items-center justify-between px-4"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
        >
          {/* FLASH — so renderiza quando suportado (Chromium/Android). iOS
              Safari nao expoe torch via web entao escondemos. flashSupported
              eh null no boot ate a stream confirmar capabilities. */}
          {flashSupported !== false ? (
            <button
              type="button"
              onClick={toggleFlash}
              disabled={!!permErr || recording}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-95 disabled:opacity-40"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
              aria-label={flashOn ? 'Desligar flash' : 'Ligar flash'}
            >
              {flashOn
                ? <Zap className="w-5 h-5" style={{ color: '#facc15', fill: '#facc15' }} />
                : <ZapOff className="w-5 h-5 text-white" />}
            </button>
          ) : (
            <div className="w-10 h-10" />
          )}

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

        {/* TIMER DE GRAVACAO — visivel, centralizado no topo enquanto grava.
            Formato MM:SS. Bolinha vermelha pulsando dah feedback visual de
            "REC ativo". Substituiu o badge antigo que mostrava "02:3s"
            (formato confuso com decimo de segundo). */}
        {recording && (
          <div
            className="absolute z-30 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full"
            style={{
              top: 'calc(env(safe-area-inset-top, 0px) + 14px)',
              background: 'rgba(220,38,38,0.92)',
              backdropFilter: 'blur(6px)',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="text-white text-sm font-bold tabular-nums" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
              {(() => {
                const total = Math.floor(recordSeconds);
                const mm = Math.floor(total / 60);
                const ss = total % 60;
                return `${mm}:${ss.toString().padStart(2, '0')}`;
              })()}
            </span>
          </div>
        )}

        {/* FILTROS — rails laterais com 10 fun (esquerda) + 10 beauty (direita).
            Escondidos durante gravacao pra nao distrair. Tap em chip troca o
            filtro do <video> E queima no canvas da foto/video gravado. */}
        <StoryCameraFilters
          activeFilterId={activeFilter.id}
          onSelectFilter={setActiveFilter}
          hidden={!!permErr || recording}
        />

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

        {/* Indicador de zoom — so aparece DURANTE a gravacao quando o user
            esta arrastando pra ajustar. Badge com o nivel atual no canto
            direito + barra vertical com posicao. Estilo minimalista pra nao
            ofuscar a preview. */}
        {recording && zoom > 1.02 && (
          <div
            className="absolute right-3 z-30 pointer-events-none flex flex-col items-center gap-2"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <span
              className="px-2 py-0.5 rounded-full text-xs font-bold text-white font-mono tabular-nums"
              style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
            >
              {zoom.toFixed(1)}x
            </span>
            <div
              className="rounded-full overflow-hidden"
              style={{ width: 4, height: 160, background: 'rgba(255,255,255,0.18)' }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${((zoom - 1) / 3) * 100}%`,
                  background: '#fff',
                  marginTop: 'auto',
                  position: 'relative',
                  top: `${100 - ((zoom - 1) / 3) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

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

          {/* Botao captura com anel de progresso. onPointerMove eh ATIVO
              enquanto o user mantem pressionado E esta gravando — rastreia
              Y pra calcular zoom (arrastar pra cima = zoom in). */}
          <button
            type="button"
            onPointerDown={onCaptureBtnDown}
            onPointerMove={onCaptureBtnMove}
            onPointerUp={onCaptureBtnUp}
            onPointerCancel={onCaptureBtnUp}
            // Bloqueia tambem o context menu do iOS (long-press normalmente
            // abre um menu de copiar/compartilhar — atrapalha gravar video)
            onContextMenu={(e) => e.preventDefault()}
            className="relative flex items-center justify-center"
            style={{
              width: 84, height: 84, touchAction: 'none',
              // background transparente explicito — alguns browsers/CSS resets
              // colocam um cinza/preto default em <button>, e a "bola interna"
              // tem area menor que a do botao. Sem isso o botao parecia
              // "preto em dark mode" porque o default do button virava
              // visivel atras do anel branco.
              background: 'transparent',
              border: 'none',
              padding: 0,
              userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
            } as React.CSSProperties}
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
            {/* Bola interna BRANCA pra foto, VERMELHA pra video.
                Ao gravar, vira quadrado vermelho pra dar feedback visual
                de "gravacao em andamento". Mesmo padrao em dark e light. */}
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

        {/* TABS de modo — estilo Instagram (POST | STORY). Tap muda o modo;
            swipe lateral no viewfinder tambem alterna. A tab ativa ganha
            ponto branco abaixo + texto branco brilhante.
            ESCONDIDAS quando lockedMode esta setado (ex: "+" badge de
            stories que abre camera so pra story). Em vez das tabs,
            mostramos apenas o label do modo travado. */}
        {lockedMode ? (
          <div
            className="flex items-center justify-center pb-2"
            style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <span
              className="text-xs font-bold uppercase"
              style={{
                fontFamily: '"DM Sans", system-ui, sans-serif',
                letterSpacing: '0.18em',
                color: '#ffffff',
                textShadow: '0 1px 4px rgba(0,0,0,0.45)',
              }}
            >
              {lockedMode === 'feed' ? 'POST' : 'STORY'}
            </span>
          </div>
        ) : (
          <div
            className="flex items-center justify-center gap-7 pb-2"
            style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {(['feed', 'story'] as const).map((m) => {
              const label = m === 'feed' ? 'POST' : 'STORY';
              const active = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className="flex flex-col items-center justify-center px-1"
                  style={{ minWidth: 56 }}
                  aria-label={`Modo ${label}`}
                >
                  <span
                    className="text-xs font-bold uppercase"
                    style={{
                      fontFamily: '"DM Sans", system-ui, sans-serif',
                      letterSpacing: '0.18em',
                      color: active ? '#ffffff' : 'rgba(255,255,255,0.55)',
                      transition: 'color 160ms ease-out',
                      textShadow: active ? '0 1px 4px rgba(0,0,0,0.45)' : undefined,
                    }}
                  >
                    {label}
                  </span>
                  <span
                    style={{
                      marginTop: 4,
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      background: active ? '#ffffff' : 'transparent',
                      transition: 'background 160ms ease-out',
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Input invisivel pra galeria.
          TRUQUE pra ENTRAR DIRETO NA GALERIA NO iOS (sem o sheet
          "Tirar Foto / Fototeca / Arquivos"):
          - `multiple` faz o iOS Safari pular o sheet de origem porque
            "Tirar Foto" so captura UMA imagem — nao faz sentido com multi.
            Resultado: o sistema abre direto a Photo Library.
          - accept="image/*,video/*" mantem foto E video selecionaveis na
            galeria.
          Mesmo declarando multiple, so usamos o PRIMEIRO arquivo (linha
          handleGalleryChange). A flag eh apenas pra mudar o comportamento
          do picker do iOS — a UX da story so suporta 1 midia por upload. */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleGalleryChange}
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
      />
    </div>,
    document.body,
  );
}
