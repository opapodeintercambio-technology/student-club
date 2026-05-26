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
  | 'meet'           // amigo criou um meet
  | 'nudge'          // alguem cutucou voce no chat (estilo MSN)
  | 'mention_post'   // voce foi mencionado num post do feed
  | 'mention_story'  // voce foi mencionado num story
  | 'chat_music_like';// alguem curtiu o card de musica que voce mandou no chat

export interface NotifyOpts {
  refId?: string;     // id do post/story/meet relacionado
  imageUrl?: string;  // thumbnail mostrada na aba Notificações
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
  // dataURLs grandes (posts com fotos em base64 podem ter MBs) estouram o
  // request do PostgREST e a notif fica sem preview. Geramos um thumbnail
  // pequeno antes — ~10-30 KB, suficiente pro preview quadrado de 56px.
  // URLs http(s) (Cloudflare/Supabase Storage) passam direto sem processar.
  let safeImage: string | undefined = opts?.imageUrl;
  if (safeImage && safeImage.startsWith('data:') && safeImage.length > 200_000) {
    safeImage = await downscaleDataUrl(safeImage, 256).catch(() => undefined);
  }

  await Promise.all([
    sendPushCustom(list, fromUser, title, body, tag).catch(() => {}),
    insertNotifs(list, fromUser, type, title, body, opts?.refId, safeImage).catch(() => {}),
  ]);
}

// Reduz um dataURL de imagem para um thumbnail quadrado (lado max = maxSize).
// Mantem aspect ratio (no caso de foto retangular o canvas e o lado maior;
// na hora de exibir como avatar 56x56 o object-cover corta o resto).
async function downscaleDataUrl(dataUrl: string, maxSize: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = img.width / img.height;
      let w: number, h: number;
      if (ratio > 1) { w = maxSize; h = Math.round(maxSize / ratio); }
      else { h = maxSize; w = Math.round(maxSize * ratio); }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(undefined); return; }
      ctx.drawImage(img, 0, 0, w, h);
      // JPEG q=0.7 da entre 8 e 25 KB para 256px — cabe folgado no PostgREST.
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => resolve(undefined);
    img.src = dataUrl;
  });
}

async function insertNotifs(
  toUsers: string[],
  fromUser: string,
  type: NotifType,
  title: string,
  body: string,
  refId?: string,
  imageUrl?: string,
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
    image_url: imageUrl ?? null,
    read: false,
    created_at: now,
  }));
  // FIX BUG: antes nao checava error — se RLS rejeitasse, destinatario
  // nunca veria pedido de amizade/like/comment. Agora loga (debug) e
  // re-lanca pra caller decidir (push ainda roda em paralelo).
  const { error } = await supabase.from('app_notifications').insert(rows);
  if (error) {
    console.warn('[notify] insertNotifs falhou:', error.message, 'rows=', rows.length);
  }
}
