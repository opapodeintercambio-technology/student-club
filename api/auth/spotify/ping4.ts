// Teste 4: replica login.ts inline com try/catch GLOBAL.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    // ── Equivalente a `if (req.method !== 'POST')` ──
    if (req.method !== 'POST') {
      res.statusCode = 405;
      return res.end(JSON.stringify({ step: 'method', method: req.method }));
    }

    // ── Equivalente a getUserIdFromRequest ──
    const authHeader = req.headers?.authorization || req.headers?.Authorization;
    let userId: string | null = null;
    if (authHeader && typeof authHeader === 'string') {
      const m = authHeader.match(/^Bearer\s+(.+)$/i);
      if (m) {
        try {
          const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
          const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
          const supa = createClient(url, key, { auth: { persistSession: false } });
          const { data } = await supa.auth.getUser(m[1]);
          userId = data?.user?.id || null;
        } catch (e: any) {
          // Continua null
        }
      }
    }
    if (!userId) {
      res.statusCode = 401;
      return res.end(JSON.stringify({ step: 'auth', authHeader: !!authHeader, hint: 'invalid token' }));
    }

    // ── Equivalente a getSpotifyCredentials ──
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const redirectUri = process.env.SPOTIFY_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      res.statusCode = 500;
      return res.end(JSON.stringify({
        step: 'spotify-config',
        missing: {
          SPOTIFY_CLIENT_ID: !clientId,
          SPOTIFY_CLIENT_SECRET: !clientSecret,
          SPOTIFY_REDIRECT_URI: !redirectUri,
        },
      }));
    }

    // ── State CSRF ──
    const state = crypto.randomBytes(32).toString('hex');

    res.statusCode = 200;
    return res.end(JSON.stringify({ step: 'ok', userId, stateLen: state.length }));
  } catch (e: any) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      step: 'GLOBAL_CATCH',
      error: e?.message || String(e),
      stack: (e?.stack || '').split('\n').slice(0, 8).join(' | '),
    }));
  }
}
