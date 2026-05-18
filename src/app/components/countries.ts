import { supabase } from '../../lib/supabase';

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
export const DATA_INTERCAMBIO_KEY = (user: string) => `papo_data_intercambio_${user}`;

export function getDataIntercambio(user: string): Date | null {
  try {
    const raw = localStorage.getItem(DATA_INTERCAMBIO_KEY(user));
    if (!raw) return null;
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

export function setDataIntercambio(user: string, iso: string | null): boolean {
  try {
    if (iso) localStorage.setItem(DATA_INTERCAMBIO_KEY(user), iso);
    else localStorage.removeItem(DATA_INTERCAMBIO_KEY(user));
    window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    supabase.from('usuarios').update({ data_intercambio: iso }).eq('username', user).then(() => {}, () => {});
    return true;
  } catch (e) {
    console.error('[countries] setDataIntercambio failed', e);
    return false;
  }
}

export function getOrigem(user: string): string {
  try { return localStorage.getItem(ORIGEM_KEY(user)) || 'BR'; } catch { return 'BR'; }
}
export function getDestino(user: string): string {
  try { return localStorage.getItem(DESTINO_KEY(user)) || 'US'; } catch { return 'US'; }
}

// Salva origem/destino com retry: localStorage sincrono pra UX instantanea +
// upload assincrono ao Supabase com persistencia em fila local caso falhe.
// Antes era fire-and-forget e a gravacao podia se perder em race conditions.

const PENDING_KEY = (user: string) => `papo_pending_trip_${user}`;
function queuePending(user: string, patch: Partial<{ origem: string; destino: string }>) {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_KEY(user)) || '{}');
    localStorage.setItem(PENDING_KEY(user), JSON.stringify({ ...cur, ...patch }));
  } catch {}
}
function clearPending(user: string) {
  try { localStorage.removeItem(PENDING_KEY(user)); } catch {}
}
async function pushUpdate(user: string, patch: Partial<{ origem: string; destino: string }>): Promise<boolean> {
  try {
    const { error } = await supabase.from('usuarios').update(patch).eq('username', user);
    if (error) { queuePending(user, patch); return false; }
    return true;
  } catch {
    queuePending(user, patch);
    return false;
  }
}

export function setOrigem(user: string, code: string): boolean {
  try {
    localStorage.setItem(ORIGEM_KEY(user), code);
    window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    queuePending(user, { origem: code });
    pushUpdate(user, { origem: code }).then(ok => { if (ok) {
      const cur = JSON.parse(localStorage.getItem(PENDING_KEY(user)) || '{}');
      delete cur.origem;
      if (Object.keys(cur).length === 0) clearPending(user);
      else localStorage.setItem(PENDING_KEY(user), JSON.stringify(cur));
    }});
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
    queuePending(user, { destino: code });
    pushUpdate(user, { destino: code }).then(ok => { if (ok) {
      const cur = JSON.parse(localStorage.getItem(PENDING_KEY(user)) || '{}');
      delete cur.destino;
      if (Object.keys(cur).length === 0) clearPending(user);
      else localStorage.setItem(PENDING_KEY(user), JSON.stringify(cur));
    }});
    return true;
  } catch (e) {
    console.error('[countries] setDestino failed', e);
    return false;
  }
}

// Retry de pendencias — chamado no mount/login. Tenta gravar de novo
// tudo que falhou em sessao anterior (ex: usuario offline ou page unload).
export async function retryPendingTrip(user: string): Promise<void> {
  try {
    const raw = localStorage.getItem(PENDING_KEY(user));
    if (!raw) return;
    const pending = JSON.parse(raw);
    if (!pending || Object.keys(pending).length === 0) { clearPending(user); return; }
    const ok = await pushUpdate(user, pending);
    if (ok) clearPending(user);
  } catch {}
}

// Hidrata origem/destino do Supabase no mount + faz reconciliacao bidirecional:
//  - se remoto tem valor: sobrescreve local
//  - se local tem valor mas remoto nao: faz upload (migracao one-shot)
//  - tenta esvaziar fila de pendencias (retry de saves que falharam antes)
export async function hydrateTripFromRemote(user: string): Promise<{ origem?: string; destino?: string; data_intercambio?: string }> {
  try {
    await retryPendingTrip(user);
    const { data } = await supabase
      .from('usuarios')
      .select('origem, destino, data_intercambio')
      .eq('username', user)
      .maybeSingle();
    if (!data) return {};
    const o = (data as any).origem;
    const d = (data as any).destino;
    const di = (data as any).data_intercambio;
    if (o) localStorage.setItem(ORIGEM_KEY(user), o);
    if (d) localStorage.setItem(DESTINO_KEY(user), d);
    if (di) localStorage.setItem(DATA_INTERCAMBIO_KEY(user), di);
    const localO = localStorage.getItem(ORIGEM_KEY(user));
    const localD = localStorage.getItem(DESTINO_KEY(user));
    const migrate: Partial<{ origem: string; destino: string }> = {};
    if (!o && localO && localO !== 'BR') migrate.origem = localO;
    if (!d && localD && localD !== 'US') migrate.destino = localD;
    if (Object.keys(migrate).length > 0) {
      supabase.from('usuarios').update(migrate).eq('username', user).then(() => {}, () => {});
    }
    if (o || d || di) window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    return { origem: o || undefined, destino: d || undefined, data_intercambio: di || undefined };
  } catch { return {}; }
}
