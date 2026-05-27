# Student Club — Arquitetura do Banco de Dados

> Projeto Supabase: **papo-de-alunos** (`inlmhgroaucpkgetrckq`)
> Postgres 17.6.1 — região `us-east-2`
> Última atualização: 2026-05-23

---

## Sumário

1. [Visão geral](#visão-geral)
2. [Diagrama ER (Mermaid)](#diagrama-er-mermaid)
3. [Decisões de design](#decisões-de-design)
4. [Tabelas](#tabelas)
   - [`usuarios`](#usuarios)
   - [`feed_posts`](#feed_posts)
   - [`stories_demo`](#stories_demo)
   - [`mensagens`](#mensagens)
   - [`chat_groups`](#chat_groups)
   - [`chat_archived`](#chat_archived)
   - [`chat_hidden`](#chat_hidden)
   - [`friend_requests`](#friend_requests)
   - [`friends_demo`](#friends_demo)
   - [`follows_demo`](#follows_demo)
   - [`app_notifications`](#app_notifications)
   - [`push_subscriptions`](#push_subscriptions)
   - [`nudge_blocks`](#nudge_blocks)
   - [`username_history`](#username_history)
   - [`papo_new_signups`](#papo_new_signups)
   - [`meets_demo`](#meets_demo)
5. [Schemas externos](#schemas-externos)
6. [Relacionamentos lógicos](#relacionamentos-lógicos)

---

## Visão geral

O banco gira em torno de **`usuarios`** como entidade central. Todas as outras tabelas se relacionam com usuários por **`username` (text)** — não há FKs formais no schema porque o username precisa ser editável pelo próprio usuário e os relacionamentos são propagados por trigger (`cascade_username_rename`) + tabela `username_history` para resolver renames antigos.

**Grupos lógicos de tabelas:**

| Grupo | Tabelas |
|---|---|
| Identidade | `usuarios`, `username_history`, `papo_new_signups` |
| Conteúdo social | `feed_posts`, `stories_demo` |
| Conversas | `mensagens`, `chat_groups`, `chat_archived`, `chat_hidden` |
| Relacionamentos | `friend_requests`, `friends_demo`, `follows_demo` |
| Notificações | `app_notifications`, `push_subscriptions`, `nudge_blocks` |
| Eventos | `meets_demo` |

---

## Diagrama ER (Mermaid)

```mermaid
erDiagram
    usuarios ||--o{ feed_posts : "publica via username"
    usuarios ||--o{ stories_demo : "publica via username"
    usuarios ||--o{ mensagens : "envia via remetente"
    usuarios ||--o{ chat_groups : "cria via created_by + members[]"
    usuarios ||--o{ friend_requests : "from_user / to_user"
    usuarios ||--o{ friends_demo : "owner / friend"
    usuarios ||--o{ follows_demo : "follower / followed"
    usuarios ||--o{ app_notifications : "to_user / from_user"
    usuarios ||--o{ push_subscriptions : "username"
    usuarios ||--o{ nudge_blocks : "blocker_user / blocked_user"
    usuarios ||--o{ chat_archived : "username"
    usuarios ||--o{ chat_hidden : "username"
    usuarios ||--o{ meets_demo : "host / participants[]"
    usuarios ||--o{ username_history : "user_id"
    usuarios ||--o{ papo_new_signups : "username"

    usuarios {
        uuid id PK
        text username UK
        text email
        text nome
        text foto_perfil
        text origem
        text destino
        text plano
        jsonb gastos_data
        bool ja_no_intercambio
        text status_conta
        timestamptz created_at
    }

    feed_posts {
        text id PK
        text username FK_implicit
        text text
        text image_url
        text video_url
        text[] images_urls
        text[] likes
        text[] views
        text[] mentions
        jsonb comments
        timestamptz created_at
    }

    stories_demo {
        text id PK
        text username FK_implicit
        text kind
        text url
        text[] likes
        text[] views
        text[] mentions
        text[] hashtags
        jsonb comments
        jsonb layers
        int duration
        timestamptz created_at
    }

    mensagens {
        uuid id PK
        text conversa_id
        text remetente FK_implicit
        text conteudo
        bool lido
        timestamptz created_at
    }

    chat_groups {
        uuid id PK
        text name
        text avatar_url
        text created_by FK_implicit
        text[] members FK_implicit
        text[] admins FK_implicit
        timestamptz created_at
    }

    friend_requests {
        text id PK
        text from_user FK_implicit
        text to_user FK_implicit
        text status
        timestamptz created_at
    }

    friends_demo {
        text owner PK_FK
        text friend PK_FK
        timestamptz created_at
    }
```

---

## Decisões de design

### 1. Sem foreign keys formais

Nenhuma tabela tem `FOREIGN KEY` declarado. Razões:

- **Username é mutável**. O usuário pode renomear-se a qualquer momento. FKs com `ON UPDATE CASCADE` em 15+ tabelas seriam difíceis de manter e bloqueariam renames em tabelas grandes.
- **Trigger `cascade_username_rename`** propaga renames via `UPDATE ... WHERE column = OLD.username` em todas as tabelas-filhas.
- **Tabela `username_history`** permite resolver referências antigas (ex: notificação antiga apontando pra um username que foi renomeado).

**Trade-off**: integridade referencial não é garantida pelo banco. Cabe à aplicação validar e à trigger limpar.

### 2. Identidade dupla: `id` (uuid) e `username` (text)

A tabela `usuarios` tem **dois identificadores**:
- `id` (uuid) — vem do Supabase Auth (`auth.users.id`), imutável
- `username` (text, UNIQUE) — escolhido e editável pelo usuário, usado em quase todas as referências

Tabelas que precisam de garantia de integridade absoluta (ex: `stories_demo.user_id`) usam o `uuid`. Tabelas que precisam de leitura humana (ex: `feed_posts.username`) usam o text.

### 3. Arrays em PostgreSQL (text[])

Várias tabelas usam `text[]` para listas pequenas e estáveis:
- `feed_posts.likes`, `views`, `images_urls`, `mentions`
- `stories_demo.likes`, `views`, `mentions`, `hashtags`
- `chat_groups.members`, `admins`
- `meets_demo.participants`

Vantagem: leitura em 1 query. Desvantagem: updates concorrentes podem perder dados (mitigado com `array_append` atomico e Realtime).

### 4. JSONB para estruturas complexas

- `feed_posts.comments`, `stories_demo.comments` — comentários inline (cada comentário tem id, user, text, likes[], replies[])
- `stories_demo.layers` — overlays interativos (texto, sticker, menção, temperatura, horário)
- `usuarios.gastos_data` — painel financeiro do intercâmbio (Viagem/Chegada/Reserva com sub-categorias)
- `usuarios.docs_checked` — checklist de documentos do intercâmbio
- `usuarios.social_links` — links de redes sociais do perfil
- `app_notifications.ref_id` — pode ser id de post, comment, story, etc. (polimórfico)

### 5. Sufixo `_demo` nas tabelas

Tabelas `stories_demo`, `friends_demo`, `follows_demo`, `meets_demo` — herança do MVP inicial onde tudo era "demo". Hoje são produção, mas o nome foi mantido pra evitar migrações destrutivas. Tudo está documentado como tabela real.

---

## Tabelas

### `usuarios`

**Tabela central.** Espelha `auth.users` (Supabase Auth) + adiciona perfil de aluno de intercâmbio.

- **PK**: `id` (uuid) — mesmo `id` do `auth.users`
- **UK**: `username` (text) — escolhido no cadastro, editável depois
- **Tamanho atual**: 24 linhas, 112 kB

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | uuid | — | **PK** — vem do auth.users |
| `username` | text | — | **UNIQUE** — usado em quase todas as outras tabelas |
| `email` | text | — | E-mail do auth |
| `nome` | text | — | Nome real |
| `telefone` | text | — | Telefone |
| `endereco` | text | — | Endereço |
| `mostrar_telefone` | bool | false | Privacidade do telefone |
| `foto_perfil` | text | — | URL da foto (Supabase Storage) |
| `tipo_conta` | text | 'pf' | 'pf' (pessoa física) ou 'pj' (legado) |
| `cpf`, `cnpj` | text | — | Documentos |
| `nome_empresa`, `segmento` | text | — | Dados PJ (legado) |
| `cidade`, `estado` | text | — | Localização |
| `lat`, `lng` | float8 | — | Geo |
| `email_verificado`, `telefone_verificado`, `verificado` | bool | false | Estados de verificação |
| `doc_enviado` | bool | false | Doc de identidade enviado |
| `score_medio`, `total_avaliacoes` | numeric, int | 0 | Reputação |
| `escola` | text | — | Escola de intercâmbio |
| `consultor` | text | — | Consultor responsável |
| `docs_checked` | jsonb | `[]` | Checklist de documentos do intercâmbio |
| `gastos_data` | jsonb | — | Painel financeiro (Viagem/Chegada/Reserva) |
| `origem`, `destino` | text | — | País origem e destino |
| `plano` | text | 'free' | 'free' / 'pro' / 'advanced' |
| `selfie_url` | text | — | Selfie de verificação |
| `status_conta` | text | 'ativa' | 'ativa' / 'bloqueada' |
| `motivo_bloqueio` | text | — | Razão se bloqueada |
| `data_intercambio` | timestamptz | — | Data de partida |
| `ja_no_intercambio` | bool | false | Já chegou no destino |
| `pais_atual` | text | — | País atual (origem ou destino) |
| `bio` | text | — | Bio do perfil |
| `social_links` | jsonb | — | Links sociais |
| `wallpaper_url` | text | — | Capa do perfil |
| `created_at`, `updated_at` | timestamptz | now() | Timestamps |

**Índices**: `usuarios_pkey (id)`, `usuarios_username_key (username) UNIQUE`

---

### `feed_posts`

Posts do feed (texto, foto, vídeo, carrossel). Visível pra todos os usuários.

- **PK**: `id` (text) — gerado no cliente (`Date.now()` + random)
- **Tamanho atual**: ~17 linhas, 4320 kB (vídeos pesam por causa dos data URLs em alguns posts antigos)

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | text | — | **PK** |
| `username` | text | — | Autor — referência implícita a `usuarios.username` |
| `foto_perfil` | text | — | Snapshot da foto na hora do post |
| `text` | text | — | Caption |
| `image_url` | text | — | URL única (post foto simples) |
| `images_urls` | text[] | — | Carrossel (2-8 imagens) |
| `video_url` | text | — | URL HLS do Cloudflare Stream |
| `likes` | text[] | `'{}'` | Array de usernames que curtiram |
| `views` | text[] | `'{}'` | Array de usernames que viram |
| `comments` | jsonb | `[]` | Comentários inline |
| `mentions` | text[] | — | Usernames mencionados |
| `created_at` | timestamptz | now() | Timestamp |

**Índices**: `feed_posts_pkey (id)`

---

### `stories_demo`

Stories de 24h (Instagram-style). Foto/vídeo + camadas interativas (texto, sticker, menção, hashtag, horário, temperatura).

- **PK**: `id` (text)
- **Tamanho atual**: ~67 linhas, 152 kB

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | text | — | **PK** |
| `user_id` | uuid | — | FK implícito → `usuarios.id` (para integridade) |
| `username` | text | — | FK implícito → `usuarios.username` (para leitura) |
| `kind` | text | — | 'image' / 'video' |
| `url` | text | — | URL da mídia (Storage ou Cloudflare Stream) |
| `text` | text | — | Legenda |
| `duration` | int | 5 | Segundos (5 = foto, até 60 = vídeo) |
| `likes` | text[] | `'{}'` | Usernames que curtiram |
| `views` | text[] | `'{}'` | Usernames que visualizaram |
| `mentions` | text[] | — | Usernames mencionados |
| `hashtags` | text[] | — | Hashtags |
| `comments` | jsonb | `[]` | Comentários |
| `layers` | jsonb | — | Camadas interativas (texto, stickers, etc.) |
| `created_at` | timestamptz | now() | Stories expiram após 24h (filtrado no cliente) |

**Índices**: `stories_demo_pkey (id)`, `idx_stories_demo_user_id (user_id)`, `stories_demo_hashtags_idx (hashtags GIN)`

---

### `mensagens`

Mensagens 1-1 e em grupo. Conversas identificadas por `conversa_id` (string composta: `username1__username2` para 1-1, `group:<uuid>` para grupos).

- **PK**: `id` (uuid)
- **Tamanho atual**: ~736 linhas, 456 kB

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | **PK** |
| `conversa_id` | text | — | Identificador da conversa |
| `remetente` | text | — | Username do autor |
| `conteudo` | text | — | Texto (ou JSON serializado para áudio/imagem/voice) |
| `lido` | bool | false | Marcado como lido |
| `created_at` | timestamptz | now() | Timestamp |

**Índices**: `mensagens_pkey (id)`, `idx_mensagens_convid_created (conversa_id, created_at)`, `idx_mensagens_remetente (remetente)`

---

### `chat_groups`

Grupos de chat (3+ participantes).

- **PK**: `id` (uuid)

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | uuid | `gen_random_uuid()` | **PK** |
| `name` | text | — | Nome do grupo |
| `avatar_url` | text | — | Avatar do grupo |
| `created_by` | text | — | Username do criador |
| `members` | text[] | `'{}'` | Usernames dos membros |
| `admins` | text[] | `'{}'` | Usernames dos admins (subset de members) |
| `created_at` | timestamptz | now() | Timestamp |

---

### `chat_archived`

Conversas arquivadas pelo usuário (não aparecem na lista principal, ficam em "Arquivadas").

- **PK composto**: (`username`, `conversa_id`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `username` | text | Quem arquivou |
| `conversa_id` | text | Qual conversa |
| `archived_at` | timestamptz | Quando arquivou |

**Índices**: `chat_archived_pkey (username, conversa_id)`, `chat_archived_username_idx (username)`

---

### `chat_hidden`

Conversas ocultadas pelo usuário (não aparecem nem em arquivadas, sumiram da lista).

- **PK composto**: (`username`, `conversa_id`)
- **Tamanho atual**: 22 linhas

| Coluna | Tipo | Descrição |
|---|---|---|
| `username` | text | Quem ocultou |
| `conversa_id` | text | Qual conversa |
| `hidden_at` | timestamptz | Quando ocultou |

---

### `friend_requests`

Pedidos de amizade pendentes.

- **PK**: `id` (text)
- **UK**: (`from_user`, `to_user`) — não pode haver duplicata
- **Tamanho atual**: ~23 linhas

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | text | — | **PK** |
| `from_user` | text | — | Quem enviou |
| `to_user` | text | — | Quem recebeu |
| `from_nome`, `from_foto_perfil`, `from_email` | text | — | Snapshot do remetente |
| `status` | text | 'pending' | 'pending' / 'accepted' / 'rejected' |
| `created_at` | timestamptz | now() | Timestamp |

---

### `friends_demo`

Amizades aceitas. **Bidirecional**: para A↔B serem amigos, há 2 linhas (`A, B` e `B, A`).

- **PK composto**: (`owner`, `friend`)
- **Tamanho atual**: ~26 linhas

| Coluna | Tipo | Descrição |
|---|---|---|
| `owner` | text | Dono da relação |
| `friend` | text | Amigo |
| `created_at` | timestamptz | Quando viraram amigos |

---

### `follows_demo`

Follows assimétricos (A segue B sem necessariamente B seguir A). Usado por contas que não são amigas mas se acompanham.

- **PK composto**: (`follower`, `followed`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `follower` | text | Quem segue |
| `followed` | text | Quem é seguido |
| `created_at` | timestamptz | Quando começou a seguir |

**Índices**: `follows_demo_pkey`, `follows_demo_follower_idx`, `follows_demo_followed_idx`

---

### `app_notifications`

Notificações in-app (sininho).

- **PK**: `id` (text)
- **Tamanho atual**: ~153 linhas, 1176 kB

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | text | — | **PK** |
| `to_user` | text | — | Destinatário |
| `from_user` | text | — | Remetente (null para notifs do sistema) |
| `type` | text | — | 'like' / 'comment' / 'mention_post' / 'mention_story' / 'follow' / 'friend_request' / 'friend_accept' / 'group_invite' / 'message' / 'system' |
| `title` | text | — | Título visível |
| `body` | text | — | Corpo da notif |
| `ref_id` | text | — | Id polimórfico (post id, comment id, story id, etc.) |
| `image_url` | text | — | Imagem ou thumbnail |
| `read` | bool | false | Marcada como lida |
| `created_at` | timestamptz | now() | Timestamp |

**Índices**: `app_notifications_pkey (id)`, `app_notif_to_user_idx (to_user, created_at DESC)`

---

### `push_subscriptions`

Subscrições Web Push (browser/PWA) por usuário e endpoint. Um usuário pode ter múltiplos endpoints (browser desktop + mobile + PWA instalado).

- **PK composto**: (`username`, `endpoint`)

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `username` | text | — | Dono |
| `endpoint` | text | — | URL do push service |
| `type` | text | 'webpush' | Tipo |
| `subscription` | text | — | JSON serializado da PushSubscription |
| `created_at`, `updated_at` | timestamptz | now() | Timestamps |

**Índices**: `push_subscriptions_pkey (username, endpoint)`, `push_subscriptions_username_idx (username)`, `push_subscriptions_updated_idx (updated_at DESC)`

---

### `nudge_blocks`

Usuários que bloquearam cutucadas (nudges) de outros. Funciona como mute parcial.

- **PK composto**: (`blocker_user`, `blocked_user`)

| Coluna | Tipo | Descrição |
|---|---|---|
| `blocker_user` | text | Quem bloqueou |
| `blocked_user` | text | Quem foi bloqueado |
| `created_at` | timestamptz | Quando bloqueou |

---

### `username_history`

Histórico de renames de username — permite resolver referências antigas.

- **PK**: `id` (uuid)

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | **PK** |
| `user_id` | uuid | Usuário que renomeou |
| `old_username` | text | Username antigo |
| `new_username` | text | Username novo |
| `changed_at` | timestamptz | Quando |

**Índices**: `username_history_pkey`, `username_history_old_idx (old_username)`, `username_history_changed_idx (changed_at DESC)`

**Uso**: ao receber uma mensagem antiga ou notificação que aponta pra um username, a UI usa `resolveCurrentUsername(old)` que consulta essa tabela para encontrar o username atual.

---

### `papo_new_signups`

Captura de leads / signups que ainda não completaram o onboarding completo.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | uuid | **PK** |
| `username` | text | Username escolhido |
| `escola` | text | Escola de intercâmbio |
| `consultor` | text | Consultor responsável |
| `pais_origem`, `pais_destino` | text | Rota |
| `created_at` | timestamptz | Timestamp |

---

### `meets_demo`

Eventos / encontros de intercambistas. Pode ser online (link) ou presencial (place).

- **PK**: `id` (text)

| Coluna | Tipo | Default | Descrição |
|---|---|---|---|
| `id` | text | — | **PK** |
| `host` | text | — | Username do organizador |
| `host_foto_perfil` | text | — | Snapshot da foto |
| `title`, `description` | text | — | Conteúdo |
| `kind` | text | — | 'online' / 'presencial' |
| `category` | text | — | Categoria do evento |
| `starts_at` | timestamptz | — | Início |
| `duration` | int | 60 | Minutos |
| `link` | text | — | URL (se online) |
| `place`, `city` | text | — | Local (se presencial) |
| `participants` | text[] | `'{}'` | Usernames inscritos |
| `max_participants` | int | — | Limite (null = ilimitado) |
| `created_at` | timestamptz | now() | Timestamp |

---

## Schemas externos

Além do `public`, o projeto usa:

- **`auth`** (gerenciado pelo Supabase) — `auth.users` é a fonte de verdade para autenticação. `usuarios.id` espelha `auth.users.id`.
- **`storage`** (gerenciado pelo Supabase) — buckets de fotos de perfil, wallpapers, mídia de stories.
- **`realtime`** (gerenciado pelo Supabase) — sub-bus de mudanças nas tabelas (`feed_posts`, `mensagens`, `stories_demo`, etc.) para entrega em tempo real.

---

## Relacionamentos lógicos

Como **não há FKs formais**, esta seção documenta as referências implícitas que a aplicação valida e o trigger `cascade_username_rename` propaga.

### Por `username` (text)

Quando um usuário renomeia seu username em `usuarios.username`, o trigger `cascade_username_rename` atualiza:

| Tabela | Colunas afetadas |
|---|---|
| `feed_posts` | `username` |
| `feed_posts.comments[]` | `user` dentro do jsonb |
| `feed_posts.likes[]`, `views[]`, `mentions[]` | array_replace |
| `stories_demo` | `username` |
| `stories_demo.comments[]` | `user` dentro do jsonb |
| `stories_demo.likes[]`, `views[]`, `mentions[]` | array_replace |
| `mensagens` | `remetente`, `conversa_id` (substring) |
| `chat_groups` | `created_by`, `members[]`, `admins[]` |
| `chat_archived` | `username`, `conversa_id` |
| `chat_hidden` | `username`, `conversa_id` |
| `friend_requests` | `from_user`, `to_user` |
| `friends_demo` | `owner`, `friend` |
| `follows_demo` | `follower`, `followed` |
| `app_notifications` | `to_user`, `from_user` |
| `push_subscriptions` | `username` |
| `nudge_blocks` | `blocker_user`, `blocked_user` |
| `meets_demo` | `host`, `participants[]` |

E **registra** a mudança em `username_history` (old → new + timestamp).

### Por `id` (uuid)

- `stories_demo.user_id` → `usuarios.id` (única tabela com FK implícito via UUID — imune a renames)
- `username_history.user_id` → `usuarios.id`

### Polimórfico (`ref_id`)

`app_notifications.ref_id` aponta para diferentes tipos de entidade dependendo de `app_notifications.type`:

| `type` | `ref_id` aponta pra |
|---|---|
| `'like'`, `'comment'`, `'mention_post'` | `feed_posts.id` |
| `'like_story'`, `'comment_story'`, `'mention_story'` | `stories_demo.id` |
| `'friend_request'`, `'friend_accept'` | `friend_requests.id` |
| `'follow'` | username do follower |
| `'group_invite'` | `chat_groups.id` |
| `'message'`, `'nudge'` | `conversa_id` |

---

## Resumo de tamanhos (snapshot)

| Tabela | Linhas (estimativa) | Tamanho total |
|---|---:|---:|
| `app_notifications` | 153 | 1.176 kB |
| `feed_posts` | 17 | 4.320 kB |
| `mensagens` | 736 | 456 kB |
| `stories_demo` | 67 | 152 kB |
| `push_subscriptions` | 24 | 112 kB |
| `usuarios` | 24 | 112 kB |
| `friend_requests` | 23 | 88 kB |
| `chat_hidden` | 22 | 64 kB |
| `friends_demo` | 26 | 64 kB |
| Outras | <30 cada | 32-64 kB |

> Total aproximado: ~6.7 MB. O peso maior está em `feed_posts` (data URLs históricos) e `app_notifications` (153 entradas).

---

## Observações para evolução futura

1. **Migrar data URLs antigos** de `feed_posts.image_url` para Supabase Storage — reduziria o tamanho da tabela em ~3-4 MB.
2. **TTL em `app_notifications`** — limpar notifs com mais de 90 dias via cron.
3. **TTL em `stories_demo`** — stories já são filtrados por 24h no cliente, mas a tabela cresce. Cron para deletar `created_at < now() - interval '7 days'`.
4. **Cleanup de `friend_requests` rejeitados** — após 30 dias, deletar status='rejected'.
5. **Considerar FKs reais com `ON UPDATE CASCADE` em `stories_demo.user_id` → `usuarios.id`** já que é uuid imutável — daria integridade gratuita.
