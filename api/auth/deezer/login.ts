// @ts-nocheck
// POST /api/auth/deezer/login
//
// Inicia o fluxo OAuth Deezer. Espelha api/auth/spotify/login.ts.

import crypto from 'node:crypto';
import { getUserIdFromRequest, getSupabaseAdmin, getDeezerCredentials } from '../../../lib/server/deezer-auth.js';

// Scopes Deezer: basic_access (info user), email, offline_access (token longa duracao)
const DEEZER_PERMS = ['basic_access', 'email', 'offline_access'].join(',');

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

  let credentials: ReturnType<typeof getDeezerCredentials>;
  try {
    credentials = getDeezerCredentials();
  } catch (e: any) {
    res.statusCode = 500;
    return res.json({ error: 'Deezer not configured', detail: e.message });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const redirectTo = typeof req.body?.redirect_to === 'string'
    ? req.body.redirect_to
    : '/conexoes';

  try {
    const supa = getSupabaseAdmin();
    const { error } = await supa.from('deezer_oauth_states').insert({
      state,
      user_id: userId,
      redirect_to: redirectTo,
    });
    if (error) {
      console.error('[deezer/login] insert state failed', error);
      res.statusCode = 500;
      return res.json({ error: 'Failed to start OAuth' });
    }
  } catch (e: any) {
    console.error('[deezer/login] supabase error', e);
    res.statusCode = 500;
    return res.json({ error: 'Failed to start OAuth' });
  }

  // Deezer authorize URL — https://connect.deezer.com/oauth/auth.php
  const authorizeUrl = new URL('https://connect.deezer.com/oauth/auth.php');
  authorizeUrl.searchParams.set('app_id', credentials.appId);
  authorizeUrl.searchParams.set('redirect_uri', credentials.redirectUri);
  authorizeUrl.searchParams.set('perms', DEEZER_PERMS);
  authorizeUrl.searchParams.set('state', state);

  res.statusCode = 200;
  return res.json({ authorize_url: authorizeUrl.toString() });
}
