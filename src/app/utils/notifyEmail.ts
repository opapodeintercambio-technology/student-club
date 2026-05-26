// Utilitário de notificação por email
// Chama /api/send-email com cooldown client-side para evitar spam de mensagens.
import { apiBase } from './apiUrl';

// Tipos legados de marketplace (match/proposal/donation) removidos — eram do
// Trok Vibe e nao sao mais usados na rede social de intercambistas.
export type EmailNotifType = 'message';

// Cooldown por chave para todos os tipos — evita duplicatas e volume excessivo.
const _lastSent = new Map<string, number>();
const COOLDOWN: Record<EmailNotifType, number> = {
  message:  30 * 60 * 1000, // 30 min
};
// Cooldown global por destinatário: no máximo 1 email a cada 5 min independente do tipo
const GLOBAL_COOLDOWN_MS = 5 * 60 * 1000;
const _lastSentGlobal = new Map<string, number>();

export function sendEmailNotif(
  recipientUsername: string,
  type: EmailNotifType,
  fromUsername: string,
  extra?: Record<string, string>,
): void {
  // Não notifica a si mesmo
  if (!recipientUsername || recipientUsername === fromUsername) return;

  // Cooldown global por destinatário (evita rafaga de tipos diferentes)
  const now = Date.now();
  const lastGlobal = _lastSentGlobal.get(recipientUsername) ?? 0;
  if (now - lastGlobal < GLOBAL_COOLDOWN_MS) return;

  // Cooldown por tipo
  const key = `${recipientUsername}:${fromUsername}:${type}`;
  const last = _lastSent.get(key) ?? 0;
  if (now - last < COOLDOWN[type]) return;

  _lastSentGlobal.set(recipientUsername, now);
  _lastSent.set(key, now);

  fetch(`${apiBase()}/api/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientUsername, type, fromUsername, extra }),
  }).catch(() => {/* fire-and-forget */});
}
