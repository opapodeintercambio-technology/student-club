// Seed de stories de demonstração na tabela stories_demo.
// Uso: node scripts/seed_demo_stories.mjs
// Insere 30 stories de imagem (Unsplash) atribuídos a usernames "demo_*"
// pra ficarem fáceis de identificar e remover depois com:
//   node scripts/seed_demo_stories.mjs --clean

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

const SUPABASE_URL = env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Faltam VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 30 stories: imagens reais (Unsplash) + legendas em português, mix
// de lugares (intercâmbio) e pessoas (estudantes).
const STORIES = [
  { user: 'demo_julia',    img: 'photo-1490604001847-b712b0c2f967', cap: 'Toronto me esperando 🇨🇦' },
  { user: 'demo_julia',    img: 'photo-1517457373958-b7bdd4587205', cap: 'CN Tower 📸' },
  { user: 'demo_pedro',    img: 'photo-1499856871958-5b9627545d1a', cap: 'Londres no fim de tarde 🚇' },
  { user: 'demo_pedro',    img: 'photo-1513635269975-59663e0ac1ad', cap: 'Tower Bridge ❤️' },
  { user: 'demo_mariana',  img: 'photo-1502602898657-3e91760cbb34', cap: 'Paris é Paris ✨' },
  { user: 'demo_mariana',  img: 'photo-1564604761600-a90b21054800', cap: 'Croissant da padaria do bairro 🥐' },
  { user: 'demo_lucas',    img: 'photo-1467269204594-9661b134dd2b', cap: 'NYC mood 🗽' },
  { user: 'demo_lucas',    img: 'photo-1538970272646-f61fabb3a8a2', cap: 'Times Square nunca dorme' },
  { user: 'demo_ana',      img: 'photo-1503614472-8c93d56e92ce', cap: 'Vancouver é um filme 🌲' },
  { user: 'demo_ana',      img: 'photo-1448375240586-882707db888b', cap: 'Trilha do fim de semana' },
  { user: 'demo_rafael',   img: 'photo-1493780474015-ba834fd0ce2f', cap: 'Sydney 🦘' },
  { user: 'demo_rafael',   img: 'photo-1506973035872-a4ec16b8e8d9', cap: 'Bondi Beach foi a melhor escolha' },
  { user: 'demo_camila',   img: 'photo-1538485399081-7a3f3f78d44b', cap: 'Dublin chuvosa, mas charmosa ☘️' },
  { use_: 'demo_camila',   img: 'photo-1486325212027-8081e485255e', cap: 'Pint depois das aulas 🍺' },
  { user: 'demo_thiago',   img: 'photo-1503614472-8c93d56e92ce', cap: 'Primeiro dia de aula!' },
  { user: 'demo_thiago',   img: 'photo-1523050854058-8df90110c9f1', cap: 'Biblioteca da uni 📚' },
  { user: 'demo_beatriz',  img: 'photo-1471623432079-b009d30b6729', cap: 'Frankfurt 🇩🇪' },
  { user: 'demo_beatriz',  img: 'photo-1505765050516-f72dcac9c60b', cap: 'Skyline alemão' },
  { user: 'demo_gabriel',  img: 'photo-1502602898657-3e91760cbb34', cap: 'Voltei pra Paris 💕' },
  { user: 'demo_gabriel',  img: 'photo-1431274172761-fca41d930114', cap: 'Louvre 🎨' },
  { user: 'demo_isabela',  img: 'photo-1551867633-194f125bddfa', cap: 'Tokyo neon 🗼' },
  { user: 'demo_isabela',  img: 'photo-1480796927426-f609979314bd', cap: 'Ramen de inverno 🍜' },
  { user: 'demo_matheus',  img: 'photo-1480714378408-67cf0d13bc1b', cap: 'Hello Manhattan' },
  { user: 'demo_matheus',  img: 'photo-1496588152823-86ff7695e68f', cap: 'Brooklyn Bridge 🌉' },
  { user: 'demo_helena',   img: 'photo-1431274172761-fca41d930114', cap: 'Aula de história da arte' },
  { user: 'demo_helena',   img: 'photo-1494522855154-9297ac14b55f', cap: 'Café da manhã com os colegas ☕' },
  { user: 'demo_leonardo', img: 'photo-1518391846015-55a9cc003b25', cap: 'Boston 🇺🇸' },
  { user: 'demo_leonardo', img: 'photo-1599577180589-0a6f1d8a7d5b', cap: 'Outono americano 🍂' },
  { user: 'demo_sofia',    img: 'photo-1493780474015-ba834fd0ce2f', cap: 'Surf antes da aula 🏄‍♀️' },
  { user: 'demo_sofia',    img: 'photo-1535079980791-a4dabd5e0c8a', cap: 'Pôr do sol em Bondi' },
];

function rowFromStory(s, idx) {
  // Espalha os created_at nas últimas 12h pra parecer real
  const minutesAgo = Math.floor((idx + 1) * (12 * 60) / STORIES.length);
  const createdAt = new Date(Date.now() - minutesAgo * 60_000).toISOString();
  const username = s.user || s.use_; // suporta typo defensivo do array
  return {
    id: `demo-${createdAt.replace(/[^0-9]/g, '')}-${idx}`,
    username,
    kind: 'image',
    url: `https://images.unsplash.com/${s.img}?w=1080&q=80&auto=format&fit=crop`,
    text: s.cap,
    duration: 5,
    created_at: createdAt,
  };
}

async function clean() {
  console.log('Apagando stories demo_* ...');
  const { error, count } = await supabase
    .from('stories_demo')
    .delete({ count: 'exact' })
    .like('username', 'demo_%');
  if (error) { console.error('Erro:', error); process.exit(1); }
  console.log(`Apagados: ${count ?? '?'}`);
}

async function seed() {
  const rows = STORIES.map(rowFromStory);
  console.log(`Inserindo ${rows.length} stories demo...`);
  const { error } = await supabase.from('stories_demo').insert(rows);
  if (error) {
    console.error('Erro ao inserir:', error);
    process.exit(1);
  }
  console.log('OK.');
}

const args = process.argv.slice(2);
if (args.includes('--clean')) {
  await clean();
} else {
  await seed();
}
