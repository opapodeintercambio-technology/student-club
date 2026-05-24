// Teste 3: tudo inline, try/catch GLOBAL pra capturar QUALQUER erro.
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export default async function handler(_req: any, res: any) {
  res.setHeader('Content-Type', 'application/json');
  try {
    // Replica spotify-auth helpers inline
    const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supa = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false },
    });
    const supaOK = !!supa;

    // Crypto check
    const buf = crypto.randomBytes(8);
    const cryptoOK = buf.length === 8;

    // Spotify env
    const cid = process.env.SPOTIFY_CLIENT_ID;
    const csec = process.env.SPOTIFY_CLIENT_SECRET;
    const cred = process.env.SPOTIFY_REDIRECT_URI;
    const cenc = process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;

    res.statusCode = 200;
    return res.end(JSON.stringify({
      ok: true,
      supaOK,
      cryptoOK,
      spotifyVars: {
        SPOTIFY_CLIENT_ID: !!cid,
        SPOTIFY_CLIENT_SECRET: !!csec,
        SPOTIFY_REDIRECT_URI: !!cred,
        SPOTIFY_TOKEN_ENCRYPTION_KEY: !!cenc,
        TOKEN_KEY_LEN: cenc?.length || 0,
      },
    }));
  } catch (e: any) {
    res.statusCode = 500;
    return res.end(JSON.stringify({
      ok: false,
      error: e?.message || String(e),
      stack: (e?.stack || '').split('\n').slice(0, 8).join('\n'),
    }));
  }
}
