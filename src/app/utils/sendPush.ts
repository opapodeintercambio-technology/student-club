import { supabase } from '../../lib/supabase';
import { apiBase } from './apiUrl';

export async function sendPushToUser(
  toUsername: string,
  fromUsername: string,
  message: string
) {
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
            fromUsername,
            message,
          }),
        }).catch(() => {});
      })
    );
  } catch {}
}
