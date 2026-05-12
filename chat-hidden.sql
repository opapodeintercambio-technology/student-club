-- Tabela para "deletar" chats por usuário sem afetar o outro
create table if not exists chat_hidden (
  username text not null,
  conversa_id text not null,
  hidden_at timestamptz not null default now(),
  primary key (username, conversa_id)
);

alter table chat_hidden enable row level security;

drop policy if exists chat_hidden_all on chat_hidden;
create policy chat_hidden_all on chat_hidden for all using (true) with check (true);

create index if not exists chat_hidden_username_idx on chat_hidden(username);
