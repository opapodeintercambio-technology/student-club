// Teste 2: importa @supabase/supabase-js direto (sem _lib/)
import { createClient } from '@supabase/supabase-js';

export default function handler(_req: any, res: any) {
  const hasUrl = !!(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const hasKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const hasSpotifyId = !!process.env.SPOTIFY_CLIENT_ID;
  const hasSpotifySecret = !!process.env.SPOTIFY_CLIENT_SECRET;
  const hasSpotifyRedirect = !!process.env.SPOTIFY_REDIRECT_URI;
  const hasSpotifyEnc = !!process.env.SPOTIFY_TOKEN_ENCRYPTION_KEY;
  const supaTypeOK = typeof createClient === 'function';
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    supaImport: supaTypeOK,
    env: {
      SUPABASE_URL: hasUrl,
      SUPABASE_SERVICE_ROLE_KEY: hasKey,
      SPOTIFY_CLIENT_ID: hasSpotifyId,
      SPOTIFY_CLIENT_SECRET: hasSpotifySecret,
      SPOTIFY_REDIRECT_URI: hasSpotifyRedirect,
      SPOTIFY_TOKEN_ENCRYPTION_KEY: hasSpotifyEnc,
    },
  }));
}
