// Sistema de amigos com PEDIDOS DE AMIZADE (estilo Instagram/Facebook).
// Tabelas Supabase:
//   - friend_requests: (id, from_user, to_user, status, ...). Status: pending | accepted | rejected
//   - friends_demo: (owner, friend). Cria 2 linhas mútuas quando o pedido é aceito.
// Cache local em localStorage pra UI instantânea.

import { supabase } from '../../lib/supabase';
import { notifyUser } from '../utils/notify';

const F_KEY  = (u: string) => `papo_friends_${u}`;
const G_KEY  = (u: string) => `papo_following_${u}`;
const SENT_KEY = (u: string) => `papo_friends_sent_${u}`; // requests que EU enviei (pendentes)

function readSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}

function writeSet(key: string, s: Set<string>) {
  localStorage.setItem(key, JSON.stringify([...s]));
  window.dispatchEvent(new CustomEvent('papo-friends-updated'));
}

// Reconcilia amigos/seguidos locais com renomeacoes feitas por outros users.
// Le username_history e troca old_username -> new_username em F_KEY/G_KEY/SENT_KEY.
// Tambem renomeia chats em cache (conversa_ids) e dispara papo-friends-updated.
const HISTORY_SEEN_KEY = (u: string) => `papo_username_history_seen_${u}`;
export async function reconcileUsernameChanges(user: string): Promise<void> {
  if (!user) return;
  try {
    const sinceRaw = localStorage.getItem(HISTORY_SEEN_KEY(user));
    const since = sinceRaw || '1970-01-01T00:00:00Z';
    const { data } = await supabase
      .from('username_history')
      .select('old_username, new_username, changed_at')
      .gt('changed_at', since)
      .order('changed_at', { ascending: true });
    if (!data || data.length === 0) {
      localStorage.setItem(HISTORY_SEEN_KEY(user), new Date().toISOString());
      return;
    }
    let dirty = false;
    const keysToRename = [F_KEY(user), G_KEY(user), SENT_KEY(user)];
    for (const row of data as Array<{ old_username: string; new_username: string }>) {
      for (const key of keysToRename) {
        const s = readSet(key);
        if (s.has(row.old_username)) {
          s.delete(row.old_username);
          s.add(row.new_username);
          writeSet(key, s);
          dirty = true;
        }
      }
    }
    localStorage.setItem(HISTORY_SEEN_KEY(user), new Date().toISOString());
    if (dirty) window.dispatchEvent(new CustomEvent('papo-friends-updated'));
  } catch { /* silencioso */ }
}

// ─── Amigos confirmados ──────────────────────────────────────────────
export function getFriends(user: string): string[] {
  return [...readSet(F_KEY(user))];
}

export function isFriend(user: string, target: string): boolean {
  return readSet(F_KEY(user)).has(target);
}

// Busca amigos do Supabase e atualiza o cache local.
export async function fetchFriendsRemote(user: string): Promise<string[]> {
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from('friends_demo')
      .select('friend')
      .eq('owner', user);
    if (error || !data) return getFriends(user);
    const friends = data.map((r: any) => r.friend);
    writeSet(F_KEY(user), new Set(friends));
    return friends;
  } catch { return getFriends(user); }
}

// ─── Pedidos enviados (estado local pra UI) ──────────────────────────
export function getSentRequests(user: string): string[] {
  return [...readSet(SENT_KEY(user))];
}

export function hasSentRequest(user: string, target: string): boolean {
  return readSet(SENT_KEY(user)).has(target);
}

// Sincroniza pedidos pendentes que EU enviei. Chamado em mounted.
export async function fetchSentRequestsRemote(user: string): Promise<string[]> {
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('to_user')
      .eq('from_user', user)
      .eq('status', 'pending');
    if (error || !data) return getSentRequests(user);
    const list = data.map((r: any) => r.to_user);
    writeSet(SENT_KEY(user), new Set(list));
    return list;
  } catch { return getSentRequests(user); }
}

// ─── Pedidos recebidos (notificações) ────────────────────────────────
export interface FriendRequest {
  id: string;
  from_user: string;
  to_user: string;
  from_nome?: string | null;
  from_foto_perfil?: string | null;
  from_email?: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
}

export async function getPendingRequests(user: string): Promise<FriendRequest[]> {
  if (!user) return [];
  try {
    const { data, error } = await supabase
      .from('friend_requests')
      .select('*')
      .eq('to_user', user)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return [];
    return data as FriendRequest[];
  } catch { return []; }
}

// ─── Ações ───────────────────────────────────────────────────────────

// Envia um pedido. Se já são amigos OU já tem pedido pendente, não duplica.
export async function sendFriendRequest(
  user: string,
  target: string,
  meta?: { from_nome?: string; from_foto_perfil?: string; from_email?: string },
): Promise<{ ok: boolean; reason?: string }> {
  if (!user || !target || user === target) return { ok: false, reason: 'invalid' };
  if (isFriend(user, target)) return { ok: false, reason: 'already_friend' };
  if (hasSentRequest(user, target)) return { ok: false, reason: 'already_pending' };
  // Atualiza cache local primeiro
  const s = readSet(SENT_KEY(user));
  s.add(target);
  writeSet(SENT_KEY(user), s);
  try {
    const id = `frq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('friend_requests').upsert({
      id,
      from_user: user,
      to_user: target,
      from_nome: meta?.from_nome ?? null,
      from_foto_perfil: meta?.from_foto_perfil ?? null,
      from_email: meta?.from_email ?? null,
      status: 'pending',
    }, { onConflict: 'from_user,to_user' });
    // Push imediato pro target — com foto do remetente como preview
    notifyUser(target, user, 'amizade', '🤝 Pedido de amizade', `${user} quer ser seu amigo`, {
      refId: `frq-${user}`,
      imageUrl: meta?.from_foto_perfil,
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

// Cancela pedido enviado (antes de ser aceito).
export async function cancelFriendRequest(user: string, target: string): Promise<boolean> {
  const s = readSet(SENT_KEY(user));
  if (!s.has(target)) return false;
  s.delete(target);
  writeSet(SENT_KEY(user), s);
  try {
    await supabase.from('friend_requests')
      .delete()
      .eq('from_user', user)
      .eq('to_user', target);
  } catch {}
  return true;
}

// Aceita um pedido: cria amizade mútua em friends_demo e marca request como accepted.
export async function acceptFriendRequest(req: FriendRequest, me: string): Promise<boolean> {
  if (!req || req.to_user !== me) return false;
  // Adiciona no cache local (eu fico amigo do from)
  const myFriends = readSet(F_KEY(me));
  myFriends.add(req.from_user);
  writeSet(F_KEY(me), myFriends);
  try {
    // Cria 2 linhas mútuas em friends_demo
    await supabase.from('friends_demo').upsert([
      { owner: me,            friend: req.from_user },
      { owner: req.from_user, friend: me            },
    ], { onConflict: 'owner,friend' });
    // Marca o request como aceito
    await supabase.from('friend_requests')
      .update({ status: 'accepted' })
      .eq('id', req.id);
    // Remove do "sent" do from (pra que do lado dele apareça como amigo)
    const sent = readSet(SENT_KEY(req.from_user));
    sent.delete(me);
    writeSet(SENT_KEY(req.from_user), sent);
  } catch {}
  // Busca minha foto pra incluir como preview na notif
  let myAvatar: string | undefined;
  try {
    const { data } = await supabase.from('usuarios').select('foto_perfil').eq('username', me).maybeSingle();
    myAvatar = data?.foto_perfil || undefined;
  } catch {}
  // Avisa o solicitante que foi aceito
  notifyUser(req.from_user, me, 'amizade', '✅ Amizade aceita', `${me} aceitou seu pedido de amizade`, {
    refId: `acc-${me}`,
    imageUrl: myAvatar,
  });
  return true;
}

// Rejeita um pedido.
export async function rejectFriendRequest(req: FriendRequest, me: string): Promise<boolean> {
  if (!req || req.to_user !== me) return false;
  try {
    await supabase.from('friend_requests')
      .update({ status: 'rejected' })
      .eq('id', req.id);
  } catch {}
  return true;
}

// Remove amigo (desfaz a amizade).
export async function removeFriend(user: string, target: string): Promise<boolean> {
  const s = readSet(F_KEY(user));
  if (!s.has(target)) return false;
  s.delete(target);
  writeSet(F_KEY(user), s);
  try {
    await supabase.from('friends_demo').delete().eq('owner', user).eq('friend', target);
    await supabase.from('friends_demo').delete().eq('owner', target).eq('friend', user);
    // Também limpa qualquer request antigo entre os dois
    await supabase.from('friend_requests')
      .delete()
      .or(`and(from_user.eq.${user},to_user.eq.${target}),and(from_user.eq.${target},to_user.eq.${user})`);
  } catch {}
  return true;
}

// Legacy alias para código antigo (usado em poucos lugares). Manda direto a request.
export const addFriend = sendFriendRequest;

// ─── Following (mesma ideia, só local por enquanto) ──────────────────
export function getFollowing(user: string): string[] {
  return [...readSet(G_KEY(user))];
}

export function isFollowing(user: string, target: string): boolean {
  return readSet(G_KEY(user)).has(target);
}

export function follow(user: string, target: string): boolean {
  if (!user || !target || user === target) return false;
  const s = readSet(G_KEY(user));
  if (s.has(target)) return false;
  s.add(target);
  writeSet(G_KEY(user), s);
  // Persiste no Supabase em background (fire-and-forget)
  supabase.from('follows_demo').insert({ follower: user, followed: target }).then(() => {}, () => {});
  // Notifica o usuario seguido (push + tab Notificacoes)
  notifyUser(target, user, 'follow', '👤 Novo seguidor', `${user} começou a te seguir`)
    .catch(() => {});
  return true;
}

export function unfollow(user: string, target: string): boolean {
  const s = readSet(G_KEY(user));
  if (!s.has(target)) return false;
  s.delete(target);
  writeSet(G_KEY(user), s);
  supabase.from('follows_demo').delete()
    .eq('follower', user).eq('followed', target)
    .then(() => {}, () => {});
  return true;
}

// ─── Contadores remotos (cross-usuário, cross-device) ────────────────
// Buscam direto do Supabase: amigos via friends_demo, seguidores via follows_demo.
// Retornam 0 em caso de erro (rede off, tabela inexistente, etc.).
export async function fetchFriendCountRemote(user: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('friends_demo')
      .select('owner', { count: 'exact', head: true })
      .eq('owner', user);
    return count ?? 0;
  } catch { return 0; }
}

export async function fetchFollowersCountRemote(user: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('follows_demo')
      .select('followed', { count: 'exact', head: true })
      .eq('followed', user);
    return count ?? 0;
  } catch { return 0; }
}

export async function fetchFollowingCountRemote(user: string): Promise<number> {
  try {
    const { count } = await supabase
      .from('follows_demo')
      .select('follower', { count: 'exact', head: true })
      .eq('follower', user);
    return count ?? 0;
  } catch { return 0; }
}
