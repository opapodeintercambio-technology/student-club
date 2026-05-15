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

const { data: st } = await sb.from('stories_demo').select('id, username, kind, created_at').order('created_at', { ascending: false });
const userCount = (st || []).reduce((acc, s) => { acc[s.username] = (acc[s.username]||0)+1; return acc; }, {});
console.log('stories por usuário:', JSON.stringify(userCount, null, 2));
const { data: fp } = await sb.from('feed_posts').select('id, username, created_at');
console.log('\nfeed_posts:');
(fp||[]).forEach(p => console.log(`  ${p.created_at} - ${p.username} - ${p.id}`));
