import { supabase } from '../../lib/supabase';
import { apiBase } from './apiUrl';

// Push padrão de chat: título "💬 @from" + body = mensagem.
export async function sendPushToUser(
  toUsername: string,
  fromUsername: string,
  message: string
) {
  return sendPushImpl(toUsername, { fromUsername, message });
}

// Push customizado — usado para likes, comentários, friend requests, meets etc.
// Aceita um único username ou um array (broadcast).
export async function sendPushCustom(
  toUsernames: string | string[],
  fromUsername: string,
  title: string,
  body: string,
  tag?: string,
) {
  const list = (Array.isArray(toUsernames) ? toUsernames : [toUsernames])
    .filter((u): u is string => typeof u === 'string' && u.length > 0 && u !== fromUsername);
  if (list.length === 0) return;
  await Promise.all(list.map(u => sendPushImpl(u, {
    fromUsername,
    customTitle: title,
    customBody: body,
    customTag: tag,
  })));
}

interface PushPayload {
  fromUsername: string;
  message?: string;
  customTitle?: string;
  customBody?: string;
  customTag?: string;
}

async function sendPushImpl(toUsername: string, payload: PushPayload) {
  try {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('subscription')
      .eq('username', toUsername);
    if (!data || data.length === 0) return;

    // Envia pra TODOS os dispositivos do usuário (web + Android + iOS)
    await Promise.all(
      data.map(row => {
        let sub: any;
        try {
          sub = typeof row.subscription === 'string' ? JSON.parse(row.subscription) : row.subscription;
        } catch {
          return Promise.resolve();
        }
        return fetch(`${apiBase()}/api/send-push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: sub,
            ...payload,
          }),
        }).catch(() => {});
      })
    );
  } catch {}
}
