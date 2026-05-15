// Inspeciona quais colunas existem em `usuarios` e se a tabela `follows_demo` existe.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envFile = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
const env = Object.fromEntries(
  envFile.split('\n').filter(l => l.trim() && !l.startsWith('#')).map(l => {
    const i = l.indexOf('=');
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }),
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

// Pega 1 linha de usuarios pra ver colunas reais
const { data: u, error: ue } = await supabase.from('usuarios').select('*').limit(1);
console.log('usuarios colunas:', u && u[0] ? Object.keys(u[0]).sort().join(', ') : '(vazio)');
if (ue) console.error('err usuarios:', ue.message);

// Tenta ler follows_demo
const { error: fe } = await supabase.from('follows_demo').select('*', { count: 'exact', head: true });
console.log('follows_demo:', fe ? `NÃO existe (${fe.message})` : 'existe');
