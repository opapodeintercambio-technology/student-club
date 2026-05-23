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
        // Buffer max de 30s a frente eh suficiente; reduz uso de
        // memoria/banda em mobile sem prejudicar a fluidez.
        maxBufferLength: 30,
        // Carrega o primeiro fragmento direto sem esperar manifesto
        // completo de qualidade — primeiro frame fica visivel mais cedo.
        lowLatencyMode: false,
      });
      hls.loadSource(src);
      hls.attachMedia(video);
      return () => hls.destroy();
    }

    video.src = src;
  }, [src]);

  return <video ref={internalRef} {...rest} />;
});
