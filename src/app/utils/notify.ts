// Helper centralizado de notificações.
// Faz DUAS coisas em paralelo:
//   1) Insere em public.app_notifications -> aparece na aba Notificações
//      (cross-device, persistente, atualizado em tempo real via Realtime).
//   2) Dispara push notification -> chega na tela do celular mesmo bloqueado.
import { supabase } from '../../lib/supabase';
import { sendPushCustom } from './sendPush';

export type NotifType =
  | 'like'           // alguém curtiu seu post
  | 'comment'        // alguém comentou seu post (ou respondeu seu comentário)
  | 'story_like'     // alguém curtiu seu story
  | 'story_comment'  // alguém comentou seu story
  | 'amizade'        // pedido / aceite de amizade
  | 'follow'         // novo seguidor
  | 'meet';          // amigo criou um meet

export interface NotifyOpts {
  refId?: string; // id do post/story/meet relacionado
}

export async function notifyUser(
  toUsers: string | string[],
  fromUser: string,
  type: NotifType,
  title: string,
  body: string,
  opts?: NotifyOpts,
): Promise<void> {
  const list = (Array.isArray(toUsers) ? toUsers : [toUsers])
    .filter((u): u is string => typeof u === 'string' && u.length > 0 && u !== fromUser);
  if (list.length === 0) return;

  const tag = opts?.refId ? `${type}-${opts.refId}` : `${type}-${Date.now()}`;

  // Roda push e insert em paralelo — push é best-effort, insert é a fonte de
  // verdade pra aba Notificações.
  await Promise.all([
    sendPushCustom(list, fromUser, title, body, tag).catch(() => {}),
    insertNotifs(list, fromUser, type, title, body, opts?.refId).catch(() => {}),
  ]);
}

async function insertNotifs(
  toUsers: string[],
  fromUser: string,
  type: NotifType,
  title: string,
  body: string,
  refId?: string,
): Promise<void> {
  const now = new Date().toISOString();
  const rows = toUsers.map((to) => ({
    id: `${type}_${to}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    to_user: to,
    from_user: fromUser,
    type,
    title,
    body,
    ref_id: refId ?? null,
    read: false,
    created_at: now,
  }));
  await supabase.from('app_notifications').insert(rows);
}
