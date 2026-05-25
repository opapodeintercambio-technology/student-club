// @ts-nocheck
// GET /api/auth/deezer/callback?code=X&state=Y
//
// Recebe redirect do Deezer apos user autorizar. Troca code por
// access_token, busca info do user no Deezer, salva tudo encriptado no DB,
// e redireciona pra a tela de origem (/conexoes?deezer=ok).

import {
  getSupabaseAdmin,
  getDeezerCredentials,
  exchangeDeezerCode,
  getDeezerUserInfo,
  encryptToken,
} from '../../../lib/server/deezer-auth.js';

// State TTL — se o user demorar > 10min pra autorizar, expira
const STATE_TTL_MS = 10 * 60 * 1000;

function redirect(res: any, to: string) {
  res.statusCode = 302;
  res.setHeader('Location', to);
  res.end();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const { code, state, error_reason } = req.query || {};

  // Falhas vindas do Deezer
  if (error_reason) {
    const reason = String(error_reason);
    if (reason === 'user_denied') return redirect(res, '/conexoes?deezer=cancel');
    return redirect(res, `/conexoes?deezer=err&reason=${encodeURIComponent(reason)}`);
  }

  if (!code || !state) {
    return redirect(res, '/conexoes?deezer=err&reason=missing_params');
  }

  let creds;
  try { creds = getDeezerCredentials(); }
  catch { return redirect(res, '/conexoes?deezer=err&reason=not_configured'); }

  const supa = getSupabaseAdmin();

  // 1. Valida state
  const { data: stateRow, error: stateErr } = await supa
    .from('deezer_oauth_states')
    .select('user_id, redirect_to, created_at')
    .eq('state', state)
    .maybeSingle();
  if (stateErr || !stateRow) {
    return redirect(res, '/conexoes?deezer=err&reason=invalid_state');
  }
  const createdAt = new Date((stateRow as any).created_at).getTime();
  if (Date.now() - createdAt > STATE_TTL_MS) {
    await supa.from('deezer_oauth_states').delete().eq('state', state);
    return redirect(res, '/conexoes?deezer=err&reason=state_expired');
  }
  const userId = (stateRow as any).user_id as string;
  const redirectTo = ((stateRow as any).redirect_to as string) || '/conexoes';

  // Limpa state (one-shot use)
  await supa.from('deezer_oauth_states').delete().eq('state', state);

  // 2. Troca code por access_token
  let tokenData: { access_token: string; expires: number };
  try {
    tokenData = await exchangeDeezerCode(String(code));
  } catch (e: any) {
    console.error('[deezer/callback] token exchange failed', e);
    return redirect(res, '/conexoes?deezer=err&reason=token_exchange');
  }

  // 3. Busca info do user (id, name) no Deezer
  const info = await getDeezerUserInfo(tokenData.access_token);
  if (!info) {
    return redirect(res, '/conexoes?deezer=err&reason=me_failed');
  }

  // 4. Salva no DB encriptado
  // expires=0 significa "infinito" (offline_access). Calculamos data
  // apenas se expires > 0.
  const expiresAt = tokenData.expires > 0
    ? new Date(Date.now() + tokenData.expires * 1000).toISOString()
    : null;
  try {
    const { error: upErr } = await supa
      .from('usuarios')
      .update({
        deezer_user_id: String(info.id),
        deezer_display_name: info.name,
        deezer_access_token: encryptToken(tokenData.access_token),
        deezer_token_expires_at: expiresAt,
        deezer_connected_at: new Date().toISOString(),
      })
      .eq('id', userId);
    if (upErr) {
      console.error('[deezer/callback] db save failed', upErr);
      return redirect(res, '/conexoes?deezer=err&reason=db_save');
    }
  } catch (e: any) {
    console.error('[deezer/callback] db error', e);
    return redirect(res, '/conexoes?deezer=err&reason=db_save');
  }

  // Sucesso! Redireciona pra origem com flag.
  const finalUrl = redirectTo.includes('?')
    ? `${redirectTo}&deezer=ok`
    : `${redirectTo}?deezer=ok`;
  return redirect(res, finalUrl);
}
