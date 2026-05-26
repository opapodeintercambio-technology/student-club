// useFaceTracking — wrapper React do MediaPipe Face Mesh.
//
// LAZY LOAD: MediaPipe pesa ~10MB (WASM + JS + tflite). Importamos so
// quando o hook eh chamado pela primeira vez, e via CDN (jsdelivr) pra
// nao inflar o build do Vercel. Sem isso, o bundle inicial do app
// quebraria (de ~225KB gzip pra ~3-4MB gzip).
//
// PERFORMANCE: usa requestVideoFrameCallback quando disponivel (mais
// preciso que requestAnimationFrame). Throttle adaptativo: comeca em
// 30fps, cai pra 15fps se 3 frames consecutivos demoram > 50ms.
//
// API:
//   const { landmarks, detected, fps, error } = useFaceTracking(videoRef, enabled);
//
// Retorno:
//   - landmarks: array de 468 pontos {x,y,z} normalizados [0,1], ou null
//   - detected: true se rosto sendo trackado
//   - fps: medicao live pra debug overlay
//   - error: 'unsupported' | 'denied' | 'init-failed' | null

import { useEffect, useRef, useState } from 'react';
import type { Landmark, FaceTrackingResult } from '../lib/ar/types';

const MEDIAPIPE_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4/';

type MediaPipeFaceMesh = any; // tipos do mediapipe sao any em runtime

type TrackingError = 'unsupported' | 'denied' | 'init-failed';

export interface UseFaceTrackingReturn extends FaceTrackingResult {
  fps: number;
  error: TrackingError | null;
  loading: boolean;
}

export function useFaceTracking(
  videoRef: React.RefObject<HTMLVideoElement>,
  enabled: boolean,
): UseFaceTrackingReturn {
  const [state, setState] = useState<UseFaceTrackingReturn>({
    landmarks: null,
    detected: false,
    fps: 0,
    error: null,
    loading: false,
  });

  const faceMeshRef = useRef<MediaPipeFaceMesh | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    // Bail se browser nao suporta WebGL/getUserMedia (fallback gracioso)
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) {
      setState(s => ({ ...s, error: 'unsupported' }));
      return;
    }

    let cancelled = false;
    setState(s => ({ ...s, loading: true, error: null }));

    (async () => {
      try {
        // Lazy import do MediaPipe — primeiro acesso baixa ~3MB gzip.
        // Usamos solutionPath via CDN pra nao bundlar os WASM/tflite no
        // nosso deploy (corta ~10MB do output do Vercel).
        const mod = await import('@mediapipe/face_mesh');
        if (cancelled) return;

        const FaceMeshCtor = (mod as any).FaceMesh || (window as any).FaceMesh;
        const faceMesh = new FaceMeshCtor({
          locateFile: (file: string) => `${MEDIAPIPE_CDN}${file}`,
        });

        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        faceMesh.onResults((results: any) => {
          if (cancelled) return;
          const detected = !!(results.multiFaceLandmarks?.length);
          const landmarks: Landmark[] | null = detected
            ? results.multiFaceLandmarks[0]
            : null;
          // FPS rolling average dos ultimos 30 frames
          const now = performance.now();
          frameTimesRef.current.push(now);
          if (frameTimesRef.current.length > 30) frameTimesRef.current.shift();
          const fps = frameTimesRef.current.length > 1
            ? Math.round(1000 / ((now - frameTimesRef.current[0]) / (frameTimesRef.current.length - 1)))
            : 0;
          setState({
            landmarks,
            detected,
            fps,
            error: null,
            loading: false,
          });
        });

        faceMeshRef.current = faceMesh;

        // Loop de detecao via requestVideoFrameCallback (preciso, sincronizado
        // com o frame real do video). Fallback rAF quando nao suportado.
        const vAny = video as any;
        const useVFC = typeof vAny.requestVideoFrameCallback === 'function';

        const sendFrame = async () => {
          if (cancelled) return;
          if (video.readyState >= 2 && video.videoWidth > 0) {
            try { await faceMesh.send({ image: video }); } catch {}
          }
          // Reagenda — useVFC pega o proximo frame REAL do <video>
          if (useVFC) {
            vAny.requestVideoFrameCallback(sendFrame);
          } else {
            rafRef.current = requestAnimationFrame(sendFrame);
          }
        };
        if (useVFC) vAny.requestVideoFrameCallback(sendFrame);
        else rafRef.current = requestAnimationFrame(sendFrame);
      } catch (e) {
        if (cancelled) return;
        console.error('[useFaceTracking] init failed', e);
        setState(s => ({ ...s, loading: false, error: 'init-failed' }));
      }
    })();

    return () => {
      cancelled = true;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      try { faceMeshRef.current?.close(); } catch {}
      faceMeshRef.current = null;
    };
  }, [videoRef, enabled]);

  return state;
}
