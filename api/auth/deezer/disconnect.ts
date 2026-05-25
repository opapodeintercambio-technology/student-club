// @ts-nocheck
// POST /api/auth/deezer/disconnect — remove a conexao Deezer do user.

import { getUserIdFromRequest, disconnectDeezer } from '../../../lib/server/deezer-auth.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.statusCode = 405;
    return res.json({ error: 'Method Not Allowed' });
  }
  const userId = await getUserIdFromRequest(req);
  if (!userId) {
    res.statusCode = 401;
    return res.json({ error: 'Unauthorized' });
  }
  try {
    await disconnectDeezer(userId);
    res.statusCode = 200;
    return res.json({ ok: true });
  } catch (e: any) {
    console.error('[deezer/disconnect] failed', e);
    res.statusCode = 500;
    return res.json({ error: 'Failed to disconnect' });
  }
}
