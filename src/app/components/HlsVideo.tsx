// Player de video que toca tanto MP4/WebM quanto HLS (.m3u8).
// Safari (Mac/iOS) toca HLS nativamente — só passa o src.
// Chrome/Firefox/Edge precisam de hls.js pra demuxar o manifest.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import Hls from 'hls.js';
import { isHlsUrl } from '../utils/streamUpload';

interface Props extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
}

export const HlsVideo = forwardRef<HTMLVideoElement, Props>(function HlsVideo(
  { src, ...rest }, externalRef,
) {
  const internalRef = useRef<HTMLVideoElement>(null);
  // Expoe o video element pro pai (usado para muted/play control)
  useImperativeHandle(externalRef, () => internalRef.current as HTMLVideoElement);

  useEffect(() => {
    const video = internalRef.current;
    if (!video || !src) return;

    if (!isHlsUrl(src)) {
      video.src = src;
      return;
    }

    // Safari (Mac e iOS) tem HLS nativo no <video>
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
      return;
    }

    // Outros browsers — usa hls.js
    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // BUG FIX: startLevel 0 -> arranca pela menor qualidade disponivel
        // (segmentos pequenos e rapidos). hls.js sobe automaticamente
        // pra qualidades maiores conforme a banda permite (ABR). Antes
        // era -1 (auto) que tentava estimar banda antes do primeiro
        // segmento — adicionava 200-400ms ao tempo do primeiro frame.
        startLevel: 0,
        // Buffer FRONTAL — agora 60s (era 30s). Pra fast-forward 2.5x e
        // scrub funcionarem suaves no Instagram-style, precisamos ter
        // muito fragmento pronto a frente. 60s = ~10 fragmentos de 6s
        // bufferados; cobre ate 24s de avanco a 2.5x sem precisar
        // baixar nada novo.
        maxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000, // 60 MB de buffer (eram default 60 MB; explicito)
        // BACK BUFFER — fragmentos JA TOCADOS ficam retidos por 90s.
        // Pra rewind funcionar suave (seek pra tras), precisamos dos
        // fragmentos anteriores prontos. Sem isso o hls.js descarta
        // imediatamente e cada rewind exige re-download.
        backBufferLength: 90,
        // Recovery rapida em seeks — quando o user fizer seek pra um
        // ponto fora do buffer, hls.js descarta o atual e carrega o
        // novo fragmento direto, sem flush manual.
        nudgeMaxRetry: 10,
        // Carrega o primeiro fragmento direto sem esperar manifesto
        // completo de qualidade — primeiro frame fica visivel mais cedo.
        lowLatencyMode: false,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      // SEEK ERROR RECOVERY — se o seek cair num ponto sem buffer e
      // o video travar, hls.js dispara erro. Recuperamos automaticamente
      // chamando hls.startLoad() — joga o player de volta no manifest
      // e re-carrega do ponto certo. Instagram-style: nunca trava de vez.
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          try { hls.startLoad(); } catch {}
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          try { hls.recoverMediaError(); } catch {}
        }
      });
      return () => hls.destroy();
    }

    video.src = src;
  }, [src]);

  return <video ref={internalRef} {...rest} />;
});
