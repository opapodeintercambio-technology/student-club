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
const { data, error } = await sb.from('usuarios').select('username, id, nome, telefone, endereco, mostrar_telefone, escola, consultor, origem, destino, docs_checked, gastos_data, foto_perfil');
if (error) console.error(error);
console.log('Dados de cada usuário:');
for (const u of (data || [])) {
  console.log('---', u.username, '---');
  console.log('  id:', u.id);
  console.log('  nome:', u.nome);
  console.log('  telefone:', u.telefone);
  console.log('  endereco:', u.endereco);
  console.log('  mostrar_telefone:', u.mostrar_telefone);
  console.log('  escola:', u.escola);
  console.log('  consultor:', u.consultor);
  console.log('  origem:', u.origem);
  console.log('  destino:', u.destino);
  console.log('  docs_checked:', JSON.stringify(u.docs_checked));
  console.log('  gastos_data:', u.gastos_data ? '(has data)' : '(null)');
  console.log('  foto_perfil:', u.foto_perfil ? 'OK' : 'NULL');
}
