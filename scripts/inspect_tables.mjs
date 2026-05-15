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

const { data: fol } = await sb.from('follows_demo').select('*').limit(2);
console.log('follows_demo sample:', JSON.stringify(fol));

const { data: fr } = await sb.from('friends_demo').select('*').limit(2);
console.log('friends_demo sample:', JSON.stringify(fr));

for (const c of ['follower', 'followed', 'from_user', 'to_user', 'user', 'target', 'owner', 'username', 'who', 'whom', 'src', 'dst', 'a', 'b']) {
  const { error } = await sb.from('follows_demo').select(c).limit(1);
  console.log(`  follows_demo.${c}:`, error ? error.message.split('\n')[0].slice(0,60) : 'ok');
}
