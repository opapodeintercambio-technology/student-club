// Helpers compartilhados pra integração Spotify.
//
// - Verificação do JWT do Supabase (extrai user_id da sessão)
// - Criptografia AES-256-GCM dos tokens Spotify antes de salvar no DB
// - Decryption + refresh automático antes de chamar APIs do Spotify
//
// IMPORTANTE: este arquivo NUNCA roda no client. Vive em api/_lib/ (o
// prefixo `_` faz o Vercel ignorá-lo como rota — só importável por
// outros handlers em api/).

import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

// ─── Supabase admin client (service role — bypassa RLS) ─────────────
let supaAdmin: ReturnType<typeof createClient> | null = null;
export function getSupabaseAdmin() {
  if (supaAdmin) return supaAdmin;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env vars missing');
  supaAdmin = createClient(url, key, { auth: { persistSession: false } });
  return supaAdmin;
}

// ─── Verifica JWT do Supabase no header Authorization ───────────────
// Retorna user_id (uuid) se válido, null caso contrário.
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

// ─── AES-256-GCM encrypt/decrypt para tokens Spotify ────────────────
// Formato armazenado: base64( iv[12] || ciphertext || authTag[16] )
const ENC_ALG = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const hex = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('SPOTIFY_TOKEN_ENCRYPTION_KEY missing — gere com `openssl rand -hex 32` e adicione no .env');
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

// ─── Spotify credentials (lazy load) ────────────────────────────────
export function getSpotifyCredentials() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Spotify env vars missing (SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, SPOTIFY_REDIRECT_URI)');
  }
  return { clientId, clientSecret, redirectUri };
}

// ─── Refresh token do Spotify ───────────────────────────────────────
// Retorna { access_token, expires_in } ou lança erro se o refresh
// falhar (ex: user revogou no Spotify → marcar como desconectado no
// caller).
export async function refreshSpotifyToken(refreshToken: string): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const { clientId, clientSecret } = getSpotifyCredentials();
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify refresh failed (${res.status}): ${text}`);
  }
  return res.json();
}

// ─── Helper consolidado: pega um access_token válido pro user ───────
// - Decripta o access_token armazenado.
// - Se expira em < 60s, faz refresh automaticamente e atualiza o DB.
// - Retorna { access_token, refreshed } ou null se user não está conectado.
// - Throws se refresh falhar (caller deve marcar usuário como desconectado).
export async function getValidSpotifyToken(userId: string): Promise<{ access_token: string; refreshed: boolean } | null> {
  const supa = getSupabaseAdmin();
  const { data, error } = await supa
    .from('usuarios')
    .select('spotify_access_token, spotify_refresh_token, spotify_token_expires_at, spotify_user_id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) return null;
  const access = (data as any).spotify_access_token;
  const refresh = (data as any).spotify_refresh_token;
  const expiresAt = (data as any).spotify_token_expires_at;
  if (!access || !refresh) return null;

  const accessPlain = decryptToken(access);
  const refreshPlain = decryptToken(refresh);
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : 0;
  const now = Date.now();

  // Se expira em < 60s, refresh
  if (expiresAtMs - now < 60_000) {
    const result = await refreshSpotifyToken(refreshPlain);
    const newAccess = result.access_token;
    const newRefresh = result.refresh_token || refreshPlain; // Spotify às vezes não devolve novo refresh
    const newExpiresAt = new Date(now + result.expires_in * 1000).toISOString();

    await supa
      .from('usuarios')
      .update({
        spotify_access_token: encryptToken(newAccess),
        spotify_refresh_token: encryptToken(newRefresh),
        spotify_token_expires_at: newExpiresAt,
      })
      .eq('id', userId);

    return { access_token: newAccess, refreshed: true };
  }

  return { access_token: accessPlain, refreshed: false };
}

// ─── Helper: marcar usuário como desconectado do Spotify ────────────
export async function disconnectSpotify(userId: string): Promise<void> {
  const supa = getSupabaseAdmin();
  await supa
    .from('usuarios')
    .update({
      spotify_user_id: null,
      spotify_display_name: null,
      spotify_access_token: null,
      spotify_refresh_token: null,
      spotify_token_expires_at: null,
      spotify_connected_at: null,
    })
    .eq('id', userId);
}

// ─── Rate limiter simples em memória (warm instance scope) ──────────
// Map<userId, { count, resetAt }>. Vercel mantém instances quentes ~15min.
// Não é distribuído — se o user pegar instance fria, conta zerada. OK
// pra controle leve; pra throttle hardcore, mover pra Supabase.
type RateBucket = { count: number; resetAt: number };
const rateBuckets: Map<string, RateBucket> = new Map();

export function checkRateLimit(userId: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(userId);
  if (!bucket || bucket.resetAt < now) {
    rateBuckets.set(userId, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}
