// GET /api/auth/spotify/callback?code=...&state=...
//
// Recebe o redirect do Spotify após o user autorizar. Valida state CSRF,
// troca code por tokens, criptografa e salva no DB do user vinculado
// ao state. Depois redireciona pro frontend (/conexoes?spotify=ok).
//
// O state foi gerado em /login e gravado em spotify_oauth_states com o
// user_id. Aqui não precisamos do JWT — autenticamos por dentro pela
// associação state → user_id.

import {
  getSupabaseAdmin,
  getSpotifyCredentials,
  encryptToken,
} from '../../../lib/server/spotify-auth';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.statusCode = 405;
    return res.end('Method Not Allowed');
  }

  const code = typeof req.query?.code === 'string' ? req.query.code : null;
  const state = typeof req.query?.state === 'string' ? req.query.state : null;
  const error = typeof req.query?.error === 'string' ? req.query.error : null;

  // User cancelou no Spotify
  if (error) {
    return redirectToConexoes(res, `spotify=cancel&reason=${encodeURIComponent(error)}`);
  }
  if (!code || !state) {
    return redirectToConexoes(res, 'spotify=err&reason=missing_params');
  }

  let credentials;
  try {
    credentials = getSpotifyCredentials();
  } catch {
    return redirectToConexoes(res, 'spotify=err&reason=not_configured');
  }

  const supa = getSupabaseAdmin();

  // Valida state e pega user_id + redirect_to associado
  const { data: stateRow, error: stateErr } = await supa
    .from('spotify_oauth_states')
    .select('user_id, redirect_to, created_at')
    .eq('state', state)
    .maybeSingle();

  if (stateErr || !stateRow) {
    return redirectToConexoes(res, 'spotify=err&reason=invalid_state');
  }
  // State expira em 10 min
  const createdAtMs = new Date((stateRow as any).created_at).getTime();
  if (Date.now() - createdAtMs > 10 * 60 * 1000) {
    await supa.from('spotify_oauth_states').delete().eq('state', state);
    return redirectToConexoes(res, 'spotify=err&reason=state_expired');
  }

  const userId = (stateRow as any).user_id as string;
  const redirectTo = (stateRow as any).redirect_to as string || '/conexoes';

  // One-shot: consume o state imediatamente
  await supa.from('spotify_oauth_states').delete().eq('state', state);

  // Troca code por tokens
  try {
    const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: credentials.redirectUri,
    });
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('[spotify/callback] token exchange failed', tokenRes.status, text);
      return redirectToConexoes(res, 'spotify=err&reason=token_exchange');
    }
    const tokens = await tokenRes.json() as { access_token: string; refresh_token: string; expires_in: number };

    // Busca info do user no Spotify
    const meRes = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    if (!meRes.ok) {
      console.error('[spotify/callback] /v1/me failed', meRes.status);
      return redirectToConexoes(res, 'spotify=err&reason=me_failed');
    }
    const me = await meRes.json() as { id: string; display_name?: string };

    // Salva tokens criptografados
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    const { error: updErr } = await supa
      .from('usuarios')
      .update({
        spotify_user_id: me.id,
        spotify_display_name: me.display_name || me.id,
        spotify_access_token: encryptToken(tokens.access_token),
        spotify_refresh_token: encryptToken(tokens.refresh_token),
        spotify_token_expires_at: expiresAt,
        spotify_connected_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (updErr) {
      console.error('[spotify/callback] update usuarios failed', updErr);
      return redirectToConexoes(res, 'spotify=err&reason=db_save');
    }

    return redirectToConexoes(res, 'spotify=ok', redirectTo);
  } catch (e: any) {
    console.error('[spotify/callback] exception', e);
    return redirectToConexoes(res, 'spotify=err&reason=exception');
  }
}

function redirectToConexoes(res: any, qs: string, path: string = '/conexoes') {
  const sep = path.includes('?') ? '&' : '?';
  res.statusCode = 302;
  res.setHeader('Location', `${path}${sep}${qs}`);
  res.end();
}
