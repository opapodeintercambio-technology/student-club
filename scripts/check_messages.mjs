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

// Tenta listar tudo (RLS aplica)
const { data: all, error: e1, count: allCount } = await sb
  .from('mensagens')
  .select('conversa_id', { count: 'exact', head: false })
  .like('conversa_id', 'group__%')
  .limit(5);
console.log('mensagens com convId group__:', allCount, 'rows:', JSON.stringify(all));
if (e1) console.error('erro:', e1.message);

// Total geral
const { count: total } = await sb.from('mensagens').select('*', { count: 'exact', head: true });
console.log('total mensagens visíveis (anon):', total);

// Por convId distinto
const { data: sample } = await sb.from('mensagens').select('conversa_id, remetente, created_at').order('created_at', { ascending: false }).limit(30);
console.log('TODAS as mensagens visíveis:');
(sample || []).forEach(r => console.log('  ', r.created_at, r.remetente, '→', r.conversa_id));
