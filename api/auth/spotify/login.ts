// POST /api/auth/spotify/login
//
// Inicia o fluxo OAuth: valida JWT do user (Student Club), gera state
// CSRF, salva no DB, e retorna a URL do Spotify pro frontend navegar.
//
// Por que POST + JSON (e não GET com 302): o frontend SPA precisa
// passar o JWT no header Authorization. Um 302 do servidor não
// preserva headers no redirect (CORS/security), então retornamos a
// URL e o frontend faz `window.location.href = url`.

import crypto from 'node:crypto';
import { getUserIdFromRequest, getSupabaseAdmin, getSpotifyCredentials } from '../../_lib/spotify-auth';

const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-read-recently-played',
  'user-top-read',
].join(' ');

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

  let credentials: ReturnType<typeof getSpotifyCredentials>;
  try {
    credentials = getSpotifyCredentials();
  } catch (e: any) {
    res.statusCode = 500;
    return res.json({ error: 'Spotify not configured', detail: e.message });
  }

  const state = crypto.randomBytes(32).toString('hex');
  const redirectTo = typeof req.body?.redirect_to === 'string'
    ? req.body.redirect_to
    : '/conexoes';

  try {
    const supa = getSupabaseAdmin();
    const { error } = await supa.from('spotify_oauth_states').insert({
      state,
      user_id: userId,
      redirect_to: redirectTo,
    });
    if (error) {
      console.error('[spotify/login] insert state failed', error);
      res.statusCode = 500;
      return res.json({ error: 'Failed to start OAuth' });
    }
  } catch (e: any) {
    console.error('[spotify/login] supabase error', e);
    res.statusCode = 500;
    return res.json({ error: 'Failed to start OAuth' });
  }

  const authorizeUrl = new URL('https://accounts.spotify.com/authorize');
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('client_id', credentials.clientId);
  authorizeUrl.searchParams.set('scope', SPOTIFY_SCOPES);
  authorizeUrl.searchParams.set('redirect_uri', credentials.redirectUri);
  authorizeUrl.searchParams.set('state', state);
  authorizeUrl.searchParams.set('show_dialog', 'false');

  res.statusCode = 200;
  return res.json({ authorize_url: authorizeUrl.toString() });
}
