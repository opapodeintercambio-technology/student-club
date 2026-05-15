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
// Limpa o "TEST" do guilherme_lima_bh e popula valores reais nos dois
await sb.from('usuarios').update({ escola: 'NED College', consultor: 'Emerson' }).eq('username', 'guilherme_lima_bh');
await sb.from('usuarios').update({ escola: 'EC English', consultor: 'Mariana Silva' }).eq('username', 'guilhermehlima22');
const { data } = await sb.from('usuarios').select('username, escola, consultor');
console.log('Após seed:');
(data||[]).forEach(u => console.log(`  ${u.username}: escola=${u.escola}, consultor=${u.consultor}`));
