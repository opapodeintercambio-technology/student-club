// Detecta se a app esta rodando dentro do Capacitor (iOS/Android nativo)
// vs PWA/web no browser. Usado pra habilitar features que dependem de
// gestos multi-touch reliable (drag/pinch/rotate) que historicamente
// quebravam em iOS PWA por causa de palm-rejection do Safari WKWebView.
//
// Em native (Capacitor) o WKWebView tem controle total da camada de
// touch sem competir com gestos do iOS (page scroll/bounce) — gestos
// funcionam bem. Em PWA o iOS injeta gestos sistemicos que disputam
// com os do app — usamos fallbacks (zonas fixas, sem pinch, etc).

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  return (window as any).Capacitor?.isNativePlatform?.() === true;
}
