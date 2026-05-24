# Spotify Integration — Student Club

> Integração OAuth com Spotify que permite alunos anexarem músicas em
> **stories**, **posts do feed** e **mensagens de chat**, usando a própria
> conta Spotify deles. Conexão é **opcional** e pode ser feita a qualquer
> momento via `/conexoes`.

---

## 🔧 Setup (você precisa fazer 1× manualmente)

### 1. Criar app no Spotify Developer Dashboard

Já foi feito por você. Confirme que os **Redirect URIs** estão configurados:

| Ambiente | URL |
|---|---|
| **Dev local** | `http://127.0.0.1:3000/api/auth/spotify/callback` |
| **Preview (Vercel)** | `https://studentclub-br.vercel.app/api/auth/spotify/callback` |
| **Produção** | `https://papodealunos.com/api/auth/spotify/callback` |

> ⚠️ **CRÍTICO:** use `127.0.0.1` no dev local, NÃO `localhost`. Spotify rejeita `localhost` desde 2024.

### 2. Gerar a chave de criptografia dos tokens

No terminal:

```bash
openssl rand -hex 32
```

Resultado: uma string hexadecimal de 64 caracteres (ex: `a3f5b8...`). Guarde — vai ser o `SPOTIFY_TOKEN_ENCRYPTION_KEY`.

### 3. Criar `.env.local` (manualmente — eu não criei)

Crie o arquivo `/Users/gui_mac/Documents/PROJETOS CODE/papo-de-alunos/.env.local` com:

```bash
SPOTIFY_CLIENT_ID=<seu-client-id-do-Spotify-Dashboard>
SPOTIFY_CLIENT_SECRET=<seu-client-secret-do-Spotify-Dashboard>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/api/auth/spotify/callback
SPOTIFY_TOKEN_ENCRYPTION_KEY=<chave-de-64-chars-gerada-no-passo-2>
```

`.env.local` **já está no `.gitignore`** — não vai pro git.

### 4. Adicionar as mesmas variáveis no Vercel

Em `vercel.com/<seu-team>/papo-de-alunos/settings/environment-variables`:

| Variável | Production | Preview | Development |
|---|---|---|---|
| `SPOTIFY_CLIENT_ID` | mesma | mesma | mesma |
| `SPOTIFY_CLIENT_SECRET` | **marcado como Secret** | mesma | mesma |
| `SPOTIFY_REDIRECT_URI` | `https://papodealunos.com/api/auth/spotify/callback` | `https://studentclub-br.vercel.app/api/auth/spotify/callback` | (não usado em produção) |
| `SPOTIFY_TOKEN_ENCRYPTION_KEY` | mesma chave de 64 chars | mesma | mesma |

> A mesma `SPOTIFY_TOKEN_ENCRYPTION_KEY` precisa estar em **todos** os ambientes. Se você mudar, tokens antigos viram inválidos (usuários precisam reconectar).

---

## 🏗️ Arquitetura

### Backend (`/api/`)

```
api/
├── _lib/
│   └── spotify-auth.ts          # crypto + token refresh + rate limit
├── auth/spotify/
│   ├── login.ts                 # POST → gera state CSRF + URL do authorize
│   ├── callback.ts              # GET  ← Spotify redireciona aqui após autorizar
│   ├── disconnect.ts            # POST → apaga tokens do user
│   └── refresh.ts               # POST → força refresh manual (raramente usado)
└── spotify/
    └── search.ts                # GET  → proxy /v1/search (rate 30/min, cache 5min)
```

### Frontend (`src/app/`)

```
src/app/
├── lib/spotify.ts                       # client-side: searchSpotifyTracks, startSpotifyLogin, etc.
├── hooks/useSpotifyConnection.ts        # hook global de estado da conexão
└── components/
    ├── ConexoesTab.tsx                  # página /conexoes
    └── spotify/
        ├── SpotifyLogo.tsx              # logo oficial SVG (verde / mono)
        ├── SpotifyConnectionCard.tsx    # card "Conectar/Desconectar"
        ├── MusicPicker.tsx              # modal de busca (reusado em 3 lugares)
        ├── TrackPlayer.tsx              # player com variants story|post|chat
        └── ChatMusicBubble.tsx          # bubble especial do chat com música
```

### Banco de dados

Já aplicada via migration `spotify_integration`:

```sql
-- usuarios: tokens criptografados + display name
ALTER TABLE usuarios ADD COLUMN spotify_user_id          text;
ALTER TABLE usuarios ADD COLUMN spotify_display_name     text;
ALTER TABLE usuarios ADD COLUMN spotify_access_token     text;   -- AES-256-GCM ciphertext
ALTER TABLE usuarios ADD COLUMN spotify_refresh_token    text;   -- AES-256-GCM ciphertext
ALTER TABLE usuarios ADD COLUMN spotify_token_expires_at timestamptz;
ALTER TABLE usuarios ADD COLUMN spotify_connected_at     timestamptz;

-- stories e feed: track opcional
ALTER TABLE stories_demo ADD COLUMN spotify_track jsonb;
ALTER TABLE feed_posts   ADD COLUMN spotify_track jsonb;

-- mensagens: ZERO migration — a música vai dentro do rich envelope
-- existente em `conteudo` (JSON-serializado com type='music').

-- state CSRF do OAuth (efêmero)
CREATE TABLE spotify_oauth_states (state PRIMARY KEY, user_id, created_at, redirect_to);
```

---

## 🎵 Schema do `spotify_track` (JSONB)

Idêntico em `stories_demo.spotify_track`, `feed_posts.spotify_track` e no
envelope rich do chat:

```ts
{
  track_id: string;        // ex: "11dFghVXANMlKmJXsNCbNl"
  name: string;
  artist: string;
  album: string;
  album_cover_url: string; // URL pública do Spotify CDN (640px)
  preview_url: string;     // MP3 público de 30s do Spotify CDN
  spotify_url: string;     // https://open.spotify.com/track/...
  duration_ms: number;
}
```

**NUNCA armazenamos áudio** — só URLs públicas do Spotify CDN. O `preview_url` é o MP3 oficial de 30s servido pelo próprio Spotify.

---

## 🔒 Restrições legais (Spotify Developer ToS)

✅ Nada de áudio baixado, cacheado ou re-encodado no servidor
✅ Nada de mixdown com mídia (vídeo + música são `<video>` + `<audio>` separados)
✅ Sem sincronização de áudio entre devices (cada um toca local)
✅ Logo oficial Spotify visível em todos os players (TrackPlayer)
✅ Deep link pra Spotify em cada track (atribuição)
✅ Mídia (post/story/msg) e metadados de track são separados
✅ Tokens criptografados no DB com AES-256-GCM

---

## 🚀 UX

### Conectar
1. User entra em **Configurações → Conexões** (ou usa atalho do MusicPicker)
2. Vê card "Spotify — Desconectado" + botão verde "Conectar Spotify"
3. Clica → redireciona pra `accounts.spotify.com` → user autoriza
4. Volta pra `/conexoes?spotify=ok` → vê "Conectado como [display_name]"

### Adicionar música em story
1. No editor de story (após capturar foto/vídeo), clica no botão Music na toolbar
2. MusicPicker abre — se não conectado, mostra CTA pra conectar; se conectado, mostra busca
3. Busca + escolhe — track aparece como chip pequeno no canto do editor
4. Publica — story sobe com `spotify_track` no DB
5. Quem vê o story ouve a música em **loop muted** (igual Instagram), toggle de som no player

### Adicionar música em post
1. No composer do feed (modal ou inline), clica no botão Música (verde)
2. MusicPicker abre, escolhe track
3. Preview do track aparece no composer com X pra remover
4. Publica — post mostra card grande com `<TrackPlayer variant="post" />` (play sob demanda)

### Mandar música no chat
1. Botão verde Music ao lado do Paperclip
2. MusicPicker abre, escolhe track
3. **Envia IMEDIATAMENTE** como mensagem (com texto do input como caption opcional)
4. Bubble verde Spotify aparece no chat — destinatário toca no próprio device

---

## 🔄 Refresh automático de token

A função `getValidSpotifyToken(userId)` em `api/_lib/spotify-auth.ts` é
chamada por **qualquer endpoint que precisa do access_token** (busca, etc).
Ela:

1. Lê tokens do DB e decripta
2. Se `expires_at` está a < 60s, faz POST `accounts.spotify.com/api/token` com `grant_type=refresh_token`
3. Salva o novo access_token e expires_at no DB (criptografado)
4. Retorna o access_token plain pro caller usar UMA vez

Se o refresh falhar (token revogado pelo user no spotify.com/account/apps),
o caller marca o user como desconectado e o frontend pede reconexão gracefully.

---

## 🐛 Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| `Spotify env vars missing` | `.env.local` não criado | Criar com as 4 vars do Spotify |
| `INVALID_CLIENT` no callback | `SPOTIFY_REDIRECT_URI` não bate com o configurado no Dashboard | Adicionar URL exata (incluindo `127.0.0.1`, não `localhost`) |
| `Cannot decrypt token` | `SPOTIFY_TOKEN_ENCRYPTION_KEY` mudou ou está diferente entre ambientes | Resetar tokens dos users (`UPDATE usuarios SET spotify_* = NULL`) e pedir reconexão |
| Track sem `preview_url` | Spotify não disponibiliza preview em todos os territórios | Search já filtra essas tracks; se aparecer, mostramos link "Ouvir no Spotify" sem player |
| `Rate limit exceeded` | User excedeu 30 buscas/min | Aguardar 1 minuto |
| Limite de 25 testers atingido | App em Development Mode | Submeter pra Extended Quota Mode no Dashboard (review do Spotify, leva ~2 semanas) |

---

## 📦 Próximos passos (não implementados nesta versão)

- [ ] Listening party (sincronizar áudio entre devices)
- [ ] Playlists colaborativas
- [ ] "Ouvindo agora" no perfil
- [ ] Recomendações baseadas em top tracks do user
- [ ] Música em comentários
- [ ] Apple Music integration
