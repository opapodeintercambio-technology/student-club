/**
 * Retorna a base URL para chamadas de API.
 * No app nativo Capacitor (Android/iOS), URLs relativas resolvem para
 * capacitor://localhost — nunca chegam ao Vercel. Usa URL absoluta.
 * No browser (Safari, Chrome), URL relativa já funciona.
 */
export function apiBase(): string {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor?.isNativePlatform?.() === true
    ) {
      return 'https://studentclub.app';
    }
  } catch {}
  return '';
}
