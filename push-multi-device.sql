-- Permite múltiplas subscriptions por usuário (web + Android + outros browsers)
alter table push_subscriptions add column if not exists endpoint text;
alter table push_subscriptions add column if not exists type text;

-- Backfill: extrai endpoint/type das subscriptions existentes
update push_subscriptions set
  type = case
    when subscription ~* '"type"\s*:\s*"fcm"' then 'fcm'
    else 'webpush'
  end
where type is null;

update push_subscriptions set
  endpoint = case
    when type = 'fcm' then (subscription::jsonb->>'token')
    else (subscription::jsonb->>'endpoint')
  end
where endpoint is null;

-- Garante endpoint não-nulo (descarta linhas sem endpoint válido)
delete from push_subscriptions where endpoint is null or endpoint = '';

-- Troca primary key: agora 1 row por (username, endpoint) → permite múltiplos devices
alter table push_subscriptions drop constraint if exists push_subscriptions_pkey;
alter table push_subscriptions add primary key (username, endpoint);

create index if not exists push_subscriptions_username_idx on push_subscriptions(username);
