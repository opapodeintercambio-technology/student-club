import { supabase } from '../../lib/supabase';

// Preferências por conversa armazenadas no localStorage.
//
// Arquivamento: lista de conversaIds (1-1 ou grupo) que o usuário escondeu
// da lista principal de chats. Não apaga nada — só esconde na ChatsTab.
//
// Bloqueio de cutucada: lista de usernames cujos nudges são ignorados.
// O listener global `papo-nudge` (App.tsx) consulta isso ANTES de tocar
// som/vibrar/tremer a tela.
//
// Chaves namespaced por currentUser → o mesmo dispositivo pode ter
// múltiplos logins sem misturar preferências.

const ARCHIVED_KEY = (user: string) => `papo_archived_chats_${user}`;
const BLOCKED_NUDGE_KEY = (user: string) => `papo_blocked_nudge_${user}`;

function loadSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr) : new Set();
  } catch { return new Set(); }
}
function saveSet(key: string, set: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch {}
  window.dispatchEvent(new CustomEvent('papo-chat-prefs-updated'));
}

// ─── Arquivamento ────────────────────────────────────────────────────────
export function getArchivedChats(currentUser: string): Set<string> {
  return loadSet(ARCHIVED_KEY(currentUser));
}
export function isChatArchived(currentUser: string, conversaId: string): boolean {
  return getArchivedChats(currentUser).has(conversaId);
}
export function archiveChat(currentUser: string, conversaId: string) {
  const s = getArchivedChats(currentUser);
  s.add(conversaId);
  saveSet(ARCHIVED_KEY(currentUser), s);
}
export function unarchiveChat(currentUser: string, conversaId: string) {
  const s = getArchivedChats(currentUser);
  s.delete(conversaId);
  saveSet(ARCHIVED_KEY(currentUser), s);
}

// ─── Bloqueio de cutucadas ───────────────────────────────────────────────
export function getNudgeBlockedUsers(currentUser: string): Set<string> {
  return loadSet(BLOCKED_NUDGE_KEY(currentUser));
}
export function isNudgeBlocked(currentUser: string, otherUser: string): boolean {
  return getNudgeBlockedUsers(currentUser).has(otherUser);
}
export function blockNudge(currentUser: string, otherUser: string) {
  const s = getNudgeBlockedUsers(currentUser);
  s.add(otherUser);
  saveSet(BLOCKED_NUDGE_KEY(currentUser), s);
  supabase.from('nudge_blocks')
    .upsert({ blocker_user: currentUser, blocked_user: otherUser })
    .then(({ error }) => { if (error) console.error('[nudge_blocks] upsert', error); });
}
export function unblockNudge(currentUser: string, otherUser: string) {
  const s = getNudgeBlockedUsers(currentUser);
  s.delete(otherUser);
  saveSet(BLOCKED_NUDGE_KEY(currentUser), s);
  supabase.from('nudge_blocks')
    .delete()
    .eq('blocker_user', currentUser)
    .eq('blocked_user', otherUser)
    .then(({ error }) => { if (error) console.error('[nudge_blocks] delete', error); });
}

// Sincroniza a blocklist LOCAL com o Supabase ao logar. Cobre o caso onde
// o user bloqueou alguém numa versão antiga (só localStorage, sem DB) — sem
// isso o remetente consultaria o DB vazio e o bloqueio nunca pegaria.
// Chamado uma vez por sessão no App.tsx quando currentUser está definido.
export async function syncLocalNudgeBlocksToRemote(currentUser: string): Promise<void> {
  const local = getNudgeBlockedUsers(currentUser);
  if (local.size === 0) return;
  try {
    const rows = Array.from(local).map(blocked_user => ({ blocker_user: currentUser, blocked_user }));
    const { error } = await supabase.from('nudge_blocks').upsert(rows);
    if (error) console.error('[nudge_blocks] sync', error);
  } catch (e) { console.error('[nudge_blocks] sync ex', e); }
}

// Verificação REMOTA (servidor) usada pelo REMETENTE da cutucada antes de
// enviar. Retorna true se `targetUser` bloqueou `senderUser`.
export async function isNudgeBlockedRemote(senderUser: string, targetUser: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('nudge_blocks')
      .select('blocker_user')
      .eq('blocker_user', targetUser)
      .eq('blocked_user', senderUser)
      .maybeSingle();
    if (error) return false;
    return !!data;
  } catch { return false; }
}
