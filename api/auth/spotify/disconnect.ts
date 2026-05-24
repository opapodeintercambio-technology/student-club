// @ts-nocheck
// POST /api/auth/spotify/disconnect
//
// Limpa tokens Spotify do user. Spotify NÃO tem endpoint público de
// revoke programático — o usuário precisa revogar em
// https://www.spotify.com/account/apps (informamos isso na UI).
// O que fazemos: deletar tudo do nosso DB. Próxima vez que tentar
// usar, o app vai pedir reconexão.

import { getUserIdFromRequest, disconnectSpotify } from '../../../lib/server/spotify-auth.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.statusCode = 401;
    return res.json({ error: 'Unauthorized' });
  }

  try {
    await disconnectSpotify(userId);
    res.statusCode = 200;
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[spotify/disconnect] failed', e);
    res.statusCode = 500;
    return res.json({ error: 'Disconnect failed' });
  }
}
