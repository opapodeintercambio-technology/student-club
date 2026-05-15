import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('/Users/gui_mac/Documents/PROJETOS CODE/papo-de-alunos/.env','utf-8').split('\n').filter(l=>l.trim()&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()];}));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
const { data } = await sb.from('usuarios').select('username, escola, consultor');
console.log('Users + escola/consultor:');
(data||[]).forEach(u => console.log(`  ${u.username}: escola=${u.escola}, consultor=${u.consultor}`));
