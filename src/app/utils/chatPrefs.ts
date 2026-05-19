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
}
export function unblockNudge(currentUser: string, otherUser: string) {
  const s = getNudgeBlockedUsers(currentUser);
  s.delete(otherUser);
  saveSet(BLOCKED_NUDGE_KEY(currentUser), s);
}
