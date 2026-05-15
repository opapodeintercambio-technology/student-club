import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(join(__dirname, '..', '.env'), 'utf-8')
    .split('\n').filter(l => l.trim() && !l.startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()]; })
);
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

const { data, error } = await sb.from('usuarios').select('username, foto_perfil, email, id, created_at').order('created_at', { ascending: false });
if (error) { console.error(error); process.exit(1); }
console.log('Usuários e foto_perfil:');
for (const u of (data || [])) {
  console.log(`  ${u.username}: ${u.foto_perfil ? u.foto_perfil : '(null)'}`);
  if (u.foto_perfil) {
    try {
      const r = await fetch(u.foto_perfil, { method: 'HEAD' });
      console.log(`    HEAD → ${r.status} ${r.statusText}, content-type=${r.headers.get('content-type') || 'N/A'}`);
    } catch (e) {
      console.log(`    HEAD failed: ${e.message}`);
    }
  }
}
