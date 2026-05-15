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

const { data } = await sb.from('chat_groups').select('id, name, members, created_at, created_by').order('created_at', { ascending: false });
console.log('TODOS os grupos:');
(data || []).forEach(g => console.log(' id:', g.id, '| name:', JSON.stringify(g.name), '| created_by:', g.created_by, '| members:', g.members));
