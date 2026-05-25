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
    // QUEUE + RETRY: igual setOrigem/setDestino. Antes era fire-and-forget
    // sem persistencia — se a chamada falhava (rede, RLS, race), o save no
    // banco se perdia silenciosamente. Aí no proximo hydrateTripFromRemote
    // o banco ainda tinha a data ANTIGA e sobrescrevia o localStorage —
    // a data "voltava" pro valor antigo.
    queuePending(user, { data_intercambio: iso });
    pushUpdate(user, { data_intercambio: iso }).then(ok => { if (ok) {
      const cur = JSON.parse(localStorage.getItem(PENDING_KEY(user)) || '{}');
      delete cur.data_intercambio;
      if (Object.keys(cur).length === 0) clearPending(user);
      else localStorage.setItem(PENDING_KEY(user), JSON.stringify(cur));
    }});
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

// Salva origem/destino/data com retry: localStorage sincrono pra UX
// instantanea + upload assincrono ao Supabase com persistencia em fila
// local caso falhe. Antes era fire-and-forget e a gravacao podia se
// perder em race conditions (especialmente data_intercambio, que nao
// tinha queue ate o fix de bug onde a data "voltava" depois de salvar).

// Patch usado pelas funcoes de queue/pushUpdate. data_intercambio pode
// ser null (user removeu a data) — origem/destino nao podem.
type TripPatch = Partial<{ origem: string; destino: string; data_intercambio: string | null }>;

const PENDING_KEY = (user: string) => `papo_pending_trip_${user}`;
// TripPatch declarado em setDataIntercambio acima — inclui data_intercambio.
function queuePending(user: string, patch: TripPatch) {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_KEY(user)) || '{}');
    localStorage.setItem(PENDING_KEY(user), JSON.stringify({ ...cur, ...patch }));
  } catch {}
}
function clearPending(user: string) {
  try { localStorage.removeItem(PENDING_KEY(user)); } catch {}
}
async function pushUpdate(user: string, patch: TripPatch): Promise<boolean> {
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

// Hidrata origem/destino/data do Supabase no mount + faz reconciliacao bidirecional:
//  - se remoto tem valor E nao ha pending update local: sobrescreve local
//  - se local tem valor mas remoto nao: faz upload (migracao one-shot)
//  - tenta esvaziar fila de pendencias (retry de saves que falharam antes)
//
// CRITICO: checamos pending updates ANTES de sobrescrever. Sem isso, um
// save pending (ex: setDataIntercambio que ainda nao chegou no banco
// porque a rede ta lenta) seria SUBSTITUIDO pelo valor antigo do remoto.
// Foi essa a causa de a data "voltar pra anterior" depois de salvar.
export async function hydrateTripFromRemote(user: string): Promise<{ origem?: string; destino?: string; data_intercambio?: string }> {
  try {
    await retryPendingTrip(user);
    // Le pending APOS retry — qualquer chave que sobrar aqui significa
    // que o retry tambem falhou (offline) e nao deve ser sobrescrita.
    let pending: TripPatch = {};
    try {
      const raw = localStorage.getItem(PENDING_KEY(user));
      if (raw) pending = JSON.parse(raw);
    } catch {}
    const { data } = await supabase
      .from('usuarios')
      .select('origem, destino, data_intercambio')
      .eq('username', user)
      .maybeSingle();
    if (!data) return {};
    const o = (data as any).origem;
    const d = (data as any).destino;
    const di = (data as any).data_intercambio;
    if (o && pending.origem === undefined) localStorage.setItem(ORIGEM_KEY(user), o);
    if (d && pending.destino === undefined) localStorage.setItem(DESTINO_KEY(user), d);
    // data_intercambio: so sobrescreve se nao tem pending E se remoto
    // tem valor diferente do local. Antes este branch sobrescrevia
    // INCONDICIONALMENTE — causa do bug.
    if (pending.data_intercambio === undefined) {
      if (di) localStorage.setItem(DATA_INTERCAMBIO_KEY(user), di);
      else localStorage.removeItem(DATA_INTERCAMBIO_KEY(user));
    }
    const localO = localStorage.getItem(ORIGEM_KEY(user));
    const localD = localStorage.getItem(DESTINO_KEY(user));
    const localDI = localStorage.getItem(DATA_INTERCAMBIO_KEY(user));
    const migrate: TripPatch = {};
    if (!o && localO && localO !== 'BR') migrate.origem = localO;
    if (!d && localD && localD !== 'US') migrate.destino = localD;
    // Migracao reversa de data_intercambio: se local tem valor e remoto
    // nao, faz upload. Cobre o caso de user que salvou offline e a fila
    // ja consumiu, mas o retry tambem falhou — entao tentamos de novo.
    if (!di && localDI) migrate.data_intercambio = localDI;
    if (Object.keys(migrate).length > 0) {
      void pushUpdate(user, migrate);
    }
    if (o || d || di) window.dispatchEvent(new CustomEvent('papo-trip-updated'));
    return { origem: o || undefined, destino: d || undefined, data_intercambio: di || undefined };
  } catch { return {}; }
}
