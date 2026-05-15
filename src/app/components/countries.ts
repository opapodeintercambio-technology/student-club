export interface Country {
  code: string;
  name: string;
  flag: string;
}

export const COUNTRIES: Country[] = [
  { code: 'BR', name: 'Brasil',         flag: '🇧🇷' },
  { code: 'US', name: 'Estados Unidos', flag: '🇺🇸' },
  { code: 'CA', name: 'Canadá',         flag: '🇨🇦' },
  { code: 'GB', name: 'Reino Unido',    flag: '🇬🇧' },
  { code: 'IE', name: 'Irlanda',        flag: '🇮🇪' },
  { code: 'AU', name: 'Austrália',      flag: '🇦🇺' },
  { code: 'NZ', name: 'Nova Zelândia',  flag: '🇳🇿' },
  { code: 'FR', name: 'França',         flag: '🇫🇷' },
  { code: 'DE', name: 'Alemanha',       flag: '🇩🇪' },
  { code: 'ES', name: 'Espanha',        flag: '🇪🇸' },
  { code: 'PT', name: 'Portugal',       flag: '🇵🇹' },
  { code: 'IT', name: 'Itália',         flag: '🇮🇹' },
  { code: 'NL', name: 'Holanda',        flag: '🇳🇱' },
  { code: 'JP', name: 'Japão',          flag: '🇯🇵' },
  { code: 'AR', name: 'Argentina',      flag: '🇦🇷' },
  { code: 'CL', name: 'Chile',          flag: '🇨🇱' },
  { code: 'MX', name: 'México',         flag: '🇲🇽' },
];

export const findCountry = (code: string): Country => COUNTRIES.find(c => c.code === code) || COUNTRIES[0];

export const ORIGEM_KEY = (user: string) => `papo_origem_${user}`;
export const DESTINO_KEY = (user: string) => `papo_destino_${user}`;

export function getOrigem(user: string): string {
  try { return localStorage.getItem(ORIGEM_KEY(user)) || 'BR'; } catch { return 'BR'; }
}
export function getDestino(user: string): string {
  try { return localStorage.getItem(DESTINO_KEY(user)) || 'US'; } catch { return 'US'; }
}

export function setOrigem(user: string, code: string): boolean {
  try {
    localStorage.setItem(ORIGEM_KEY(user), code);
    window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    return true;
  } catch (e) {
    console.error('[countries] setOrigem failed', e);
    return false;
  }
}
export function setDestino(user: string, code: string): boolean {
  try {
    localStorage.setItem(DESTINO_KEY(user), code);
    window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    return true;
  } catch (e) {
    console.error('[countries] setDestino failed', e);
    return false;
  }
}
