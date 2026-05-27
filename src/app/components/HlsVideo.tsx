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
        // startLevel 0 -> arranca pela menor qualidade disponivel
        // (segmentos pequenos e rapidos). hls.js sobe automaticamente
        // pra qualidades maiores conforme a banda permite (ABR).
        startLevel: 0,
        // ─── BUFFER YOUTUBE-STYLE (smooth fast-forward + seek) ───────
        // Buffer FRONTAL aumentado pra 120s (era 60s). Cobre 48s de
        // playback a 2.5x sem re-download — mesma sensacao do YouTube
        // que adianta sem parar. Memoria: ~80MB pico (aceitavel mobile).
        maxBufferLength: 120,
        maxMaxBufferLength: 240, // hard ceiling se rede aguenta
        maxBufferSize: 80 * 1000 * 1000, // 80 MB buffer
        // BACK BUFFER — fragmentos JA TOCADOS ficam retidos por 90s
        // pra rewind suave.
        backBufferLength: 90,
        // ABR adaptativo — quando user faz fast-forward, hls.js troca
        // pra menor qualidade rapido (evita freeze). Volta pra alta
        // qualidade quando o user solta o fast-forward.
        abrEwmaFastVoD: 1.5, // janela ABR menor = troca de qualidade mais reativa
        abrEwmaSlowVoD: 9.0,
        // capLevelToPlayerSize — limita qualidade ao tamanho do video
        // na tela (nao baixa 4K se o player so tem 600px). Reduz banda
        // sem perda visual perceptivel.
        capLevelToPlayerSize: true,
        // Recovery rapida em seeks — quando o user faz seek pra um
        // ponto fora do buffer, hls.js descarta atual e carrega o novo
        // fragmento direto, sem flush manual.
        nudgeMaxRetry: 10,
        nudgeOffset: 0.1,
        // Pre-fetch do proximo fragmento — comeca a baixar antes do
        // atual terminar. Crucial pra fast-forward nao engasgar.
        startFragPrefetch: true,
        // Retry agressivo em fragmentos que falham — evita freezes
        // por flakiness de rede transitoria.
        fragLoadingMaxRetry: 6,
        manifestLoadingMaxRetry: 4,
        levelLoadingMaxRetry: 4,
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
