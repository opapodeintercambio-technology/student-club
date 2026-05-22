// Resolve usernames antigos -> username atual via tabela username_history.
//
// Problema raiz: quando um user troca de username (ex: erika_santos ->
// aerikapaolla), conversas anteriores ficavam orfas porque o convId
// dependia do username (que mudou). Resultado: aparecia conversa
// duplicada com o nome novo + a foto sumia (busca era pelo username
// antigo que nao existe mais em usuarios).
//
// Solucao: SEMPRE resolver pro username ATUAL antes de:
//   - Calcular convId (chat)
//   - Buscar foto de perfil
//   - Dedupar conversas na lista
//
// Cache em memoria por sessao — invalida quando o evento global
// 'papo-username-renamed' eh disparado.

import { supabase } from '../../lib/supabase';

// Map<usernameQualquer, usernameAtual> — fast-path em sessoes longas
const RESOLVE_CACHE = new Map<string, string>();
let inFlight: Map<string, Promise<string>> = new Map();

/**
 * Resolve um username (que pode ser antigo) pro username ATUAL daquela
 * mesma conta. Se o username ja eh o atual, retorna ele mesmo. Se nao
 * encontrar registro, retorna o input original.
 */
export async function resolveCurrentUsername(username: string): Promise<string> {
  if (!username) return username;
  const cached = RESOLVE_CACHE.get(username);
  if (cached) return cached;
  if (inFlight.has(username)) return inFlight.get(username)!;

  const promise = (async () => {
    try {
      // 1) Fast-path: se ja existe user atual com esse username, eh ele mesmo
      const { data: direct } = await supabase
        .from('usuarios')
        .select('id')
        .eq('username', username)
        .maybeSingle();
      if (direct) {
        RESOLVE_CACHE.set(username, username);
        return username;
      }
      // 2) Busca historico — pega o user_id mais recente que tinha esse
      //    username como old_username (rename queue: A -> B -> C -> ...)
      const { data: hist } = await supabase
        .from('username_history')
        .select('user_id')
        .or(`old_username.eq.${username},new_username.eq.${username}`)
        .order('changed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const uid = (hist as any)?.user_id;
      if (!uid) {
        RESOLVE_CACHE.set(username, username);
        return username;
      }
      // 3) Resolve o username atual desse user_id
      const { data: user } = await supabase
        .from('usuarios')
        .select('username')
        .eq('id', uid)
        .maybeSingle();
      const current = (user as any)?.username || username;
      RESOLVE_CACHE.set(username, current);
      // Tambem cacheia o atual -> atual pra acelerar futuras chamadas
      RESOLVE_CACHE.set(current, current);
      return current;
    } catch {
      return username;
    } finally {
      inFlight.delete(username);
    }
  })();
  inFlight.set(username, promise);
  return promise;
}

/**
 * Versao em bulk pra resolver varios usernames de uma vez (ChatsTab usa
 * isso pra processar a lista de conversas inteira em ~2 queries em vez
 * de N). Retorna Map<input, current>.
 */
export async function bulkResolveCurrentUsernames(usernames: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (usernames.length === 0) return result;

  // 0) Identidade default + fast-path via cache
  const toFetch: string[] = [];
  usernames.forEach(u => {
    if (!u) return;
    const c = RESOLVE_CACHE.get(u);
    if (c) result.set(u, c);
    else { result.set(u, u); toFetch.push(u); }
  });
  if (toFetch.length === 0) return result;

  try {
    // 1) Pra cada user que existe atualmente, mapeia identidade
    const { data: directRows } = await supabase
      .from('usuarios')
      .select('username')
      .in('username', toFetch);
    const existsNow = new Set<string>((directRows as any[] || []).map(r => r.username));
    existsNow.forEach(u => {
      result.set(u, u);
      RESOLVE_CACHE.set(u, u);
    });
    const stillMissing = toFetch.filter(u => !existsNow.has(u));
    if (stillMissing.length === 0) return result;

    // 2) Pra cada username faltante, busca em username_history
    //    (pode estar como old_username OU new_username)
    const { data: histRows } = await supabase
      .from('username_history')
      .select('user_id, old_username, new_username, changed_at')
      .or(`old_username.in.(${stillMissing.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',')}),new_username.in.(${stillMissing.map(u => `"${u.replace(/"/g, '\\"')}"`).join(',')})`)
      .order('changed_at', { ascending: false });
    if (!histRows || histRows.length === 0) return result;

    // 3) Mapeia user_id -> input username (pega o mais recente)
    const inputToUserId = new Map<string, string>();
    (histRows as any[]).forEach(r => {
      if (stillMissing.includes(r.old_username) && !inputToUserId.has(r.old_username)) {
        inputToUserId.set(r.old_username, r.user_id);
      }
      if (stillMissing.includes(r.new_username) && !inputToUserId.has(r.new_username)) {
        inputToUserId.set(r.new_username, r.user_id);
      }
    });
    if (inputToUserId.size === 0) return result;

    // 4) Resolve user_id -> username atual em bulk
    const uids = [...new Set(inputToUserId.values())];
    const { data: userRows } = await supabase
      .from('usuarios')
      .select('id, username')
      .in('id', uids);
    const uidToCurrent = new Map<string, string>();
    (userRows as any[] || []).forEach(u => uidToCurrent.set(u.id, u.username));

    // 5) Constroi o map final
    inputToUserId.forEach((uid, input) => {
      const current = uidToCurrent.get(uid);
      if (current) {
        result.set(input, current);
        RESOLVE_CACHE.set(input, current);
        RESOLVE_CACHE.set(current, current);
      }
    });
  } catch {}

  return result;
}

/**
 * Limpa o cache — chamar quando um username for renomeado pra forcar
 * re-resolucao (raro, mas garante consistencia em sessoes longas).
 */
export function clearUsernameResolveCache() {
  RESOLVE_CACHE.clear();
  inFlight.clear();
}

// Listener global: quando um username eh renomeado, limpa o cache.
if (typeof window !== 'undefined') {
  window.addEventListener('papo-username-renamed', () => clearUsernameResolveCache());
}
