-- ────────────────────────────────────────────────────────────────────────────
-- FASE 7 — Migração: mover dados de perfil de localStorage pro Supabase
-- ────────────────────────────────────────────────────────────────────────────
-- COMO RODAR:
--   1) Abra o painel do Supabase do projeto papo-de-alunos
--      (https://supabase.com → seu projeto → SQL Editor)
--   2) Cole TODO este arquivo
--   3) Clique em "Run"
-- ────────────────────────────────────────────────────────────────────────────

-- 1) Adiciona escola e consultor na tabela usuarios
alter table public.usuarios
  add column if not exists escola text,
  add column if not exists consultor text;

-- 2) Cria a tabela follows_demo (quem segue quem)
create table if not exists public.follows_demo (
  follower    text not null,
  followed    text not null,
  created_at  timestamptz not null default now(),
  primary key (follower, followed)
);

create index if not exists follows_demo_followed_idx
  on public.follows_demo (followed);

create index if not exists follows_demo_follower_idx
  on public.follows_demo (follower);

-- 3) RLS — qualquer usuário autenticado pode ler; só o próprio follower pode escrever
alter table public.follows_demo enable row level security;

drop policy if exists follows_demo_read on public.follows_demo;
create policy follows_demo_read on public.follows_demo
  for select using (true);

drop policy if exists follows_demo_insert on public.follows_demo;
create policy follows_demo_insert on public.follows_demo
  for insert with check (true);

drop policy if exists follows_demo_delete on public.follows_demo;
create policy follows_demo_delete on public.follows_demo
  for delete using (true);
