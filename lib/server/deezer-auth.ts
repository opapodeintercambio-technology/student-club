// @ts-nocheck
// Helpers compartilhados pra integração Deezer OAuth.
// Espelha lib/server/spotify-auth.ts — mesma estrutura, endpoints diferentes.
//
// FLUXO OAUTH DEEZER:
//   1. /api/auth/deezer/login — gera state, redireciona pra connect.deezer.com
//   2. User autoriza no Deezer
//   3. Deezer redireciona pra /api/auth/deezer/callback?code=X&state=Y
//   4. Callback troca code por access_token, salva no DB (encriptado)
//   5. Frontend descobre via useDeezerConnection (refetch + listener)
//
// Diferenças vs Spotify:
//   - Deezer NÃO usa refresh_token. O access_token dura ~30 dias (ou mais)
//     e renova ao usar. Quando expira, user precisa re-autorizar.
//   - Token exchange é GET (não POST) — usa querystring.
//   - Resposta do token exchange é text/plain `access_token=X&expires=N`
//     (não JSON como Spotify).

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

let supaAdmin: ReturnType<typeof createClient> | null = null;
export function getSupabaseAdmin() {
  if (supaAdmin) return supaAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  supaAdmin = createClient(url, key, { auth: { persistSession: false } });
  return supaAdmin;
}

export async function getUserIdFromRequest(req: any): Promise<string | null> {
  const authHeader: string | undefined = req.headers?.authorization || req.headers?.Authorization;
  if (!authHeader || typeof authHeader !== 'string') return null;
  const m = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1];
  try {
    const supa = getSupabaseAdmin();
    const { data, error } = await supa.auth.getUser(token);
    if (error || !data?.user) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

// ─── AES-256-GCM encrypt/decrypt para token Deezer ──────────────────
// Reutilizamos a MESMA chave de criptografia do Spotify (SPOTIFY_TOKEN_
// ENCRYPTION_KEY). Não é estritamente necessário separar e dá pra economizar
// uma variavel de ambiente.
const ENC_ALG = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const hex = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY missing — adicione no .env (32 bytes hex)');
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY must be 32 bytes hex (64 chars)');
  return buf;
}

export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENC_ALG, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

export function decryptToken(payload: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < 12 + 16 + 1) throw new Error('Ciphertext too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(buf.length - 16);
  const ct = buf.subarray(12, buf.length - 16);
  const decipher = crypto.createDecipheriv(ENC_ALG, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ─── Deezer credentials ─────────────────────────────────────────────
export function getDeezerCredentials() {
  const appId = process.env.DEEZER_APP_ID;
  const secret = process.env.DEEZER_APP_SECRET;
  const redirectUri = process.env.DEEZER_REDIRECT_URI;
  if (!appId || !secret || !redirectUri) {
    throw new Error('Deezer env vars missing (DEEZER_APP_ID, DEEZER_APP_SECRET, DEEZER_REDIRECT_URI)');
  }
  return { appId, secret, redirectUri };
}

// ─── Token exchange — POST não é suportado, Deezer usa GET ──────────
export async function exchangeDeezerCode(code: string): Promise<{ access_token: string; expires: number }> {
  const { appId, secret } = getDeezerCredentials();
  const url = new URL('https://connect.deezer.com/oauth/access_token.php');
  url.searchParams.set('app_id', appId);
  url.searchParams.set('secret', secret);
  url.searchParams.set('code', code);
  url.searchParams.set('output', 'json'); // pede JSON em vez de form-encoded
  const res = await fetch(url.toString(), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Deezer token exchange falhou: ${res.status}`);
  }
  const text = await res.text();
  // Deezer as vezes ignora output=json e retorna form-encoded.
  // Suportamos os 2 formatos.
  let access_token: string | undefined;
  let expires = 0;
  try {
    const json = JSON.parse(text);
    access_token = json.access_token;
    expires = Number(json.expires) || 0;
  } catch {
    // Fallback form-encoded: access_token=XXX&expires=NNN
    const params = new URLSearchParams(text);
    access_token = params.get('access_token') || undefined;
    expires = Number(params.get('expires')) || 0;
  }
  if (!access_token) throw new Error('Deezer não retornou access_token');
  return { access_token, expires };
}

// ─── Busca info do user no Deezer (api.deezer.com/user/me) ──────────
export async function getDeezerUserInfo(accessToken: string): Promise<{ id: number; name: string; email?: string } | null> {
  try {
    const url = new URL('https://api.deezer.com/user/me');
    url.searchParams.set('access_token', accessToken);
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = await res.json();
    if (!json?.id) return null;
    return { id: json.id, name: json.name || 'Usuário Deezer', email: json.email };
  } catch { return null; }
}

// ─── Helper: pega access_token decrypt'ado pro user ─────────────────
export async function getValidDeezerToken(userId: string): Promise<{ access_token: string } | null> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('usuarios')
    .select('deezer_access_token, deezer_token_expires_at')
    .eq('id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const access = (data as any).deezer_access_token;
  const expiresAt = (data as any).deezer_token_expires_at;
  if (!access) return null;
  // Deezer nao tem refresh — se expirou, retorna null e user precisa reconectar
  if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return null;
  return { access_token: decryptToken(access) };
}

// ─── Desconectar Deezer (limpa colunas no DB) ───────────────────────
export async function disconnectDeezer(userId: string): Promise<void> {
  const supa = getSupabaseAdmin();
  await supa
    .from('usuarios')
    .update({
      deezer_user_id: null,
      deezer_display_name: null,
      deezer_access_token: null,
      deezer_token_expires_at: null,
      deezer_connected_at: null,
    })
    .eq('id', userId);
}
