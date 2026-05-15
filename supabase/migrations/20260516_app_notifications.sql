-- Notificações in-app persistentes (cross-device).
-- Cada linha = um alerta para `to_user` que aparece na aba Notificações.
-- Carregado on-mount e atualizado em tempo real via Realtime postgres_changes.
create table if not exists public.app_notifications (
  id          text primary key,
  to_user     text not null,
  from_user   text,
  type        text not null,        -- 'like','comment','story_like','story_comment','amizade','follow','meet'
  title       text not null,
  body        text,
  ref_id      text,                 -- id do post/story/meet relacionado
  read        boolean default false,
  created_at  timestamptz default now()
);

create index if not exists app_notif_to_user_idx
  on public.app_notifications (to_user, created_at desc);

alter table public.app_notifications enable row level security;

-- Policies abertas (parecidas com push_subscriptions): qualquer usuário pode
-- inserir e ler. Validação acontece na lógica do app — esse modelo segue o
-- padrão das outras tabelas demo do projeto (friend_requests, feed_posts etc).
drop policy if exists "app_notif_select" on public.app_notifications;
create policy "app_notif_select" on public.app_notifications
  for select using (true);

drop policy if exists "app_notif_insert" on public.app_notifications;
create policy "app_notif_insert" on public.app_notifications
  for insert with check (true);

drop policy if exists "app_notif_update" on public.app_notifications;
create policy "app_notif_update" on public.app_notifications
  for update using (true);

drop policy if exists "app_notif_delete" on public.app_notifications;
create policy "app_notif_delete" on public.app_notifications
  for delete using (true);

-- Habilita Realtime na tabela
alter publication supabase_realtime add table public.app_notifications;
