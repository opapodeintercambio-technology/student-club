# Student Club — Memória do Projeto

> Projeto: **Student Club** (pasta de código: `papo-de-alunos`)
> Deploy: https://studentclub.app
> Data da última atualização desta memória: 2026-05-22

---

## Preferências do usuário (sempre respeitar)

- **Idioma**: Responder SEMPRE em português. Nunca em inglês.

---

## Stack

- **Vite 6 + React 18** + TypeScript (NÃO é Next.js — CLAUDE.md anterior estava incorreto)
- **Capacitor 8** — wrappers nativos iOS/Android (não usado em web)
- **Supabase** — auth, banco de dados, realtime (presença online)
- **Cloudflare Stream** — hospedagem e entrega de vídeos do feed (HLS)
- **Vercel** — deploy automático no push do branch `main`
- **Vercel Functions** — endpoints serverless em `/api/*.ts` (Node, não Next API routes)
- **Spotify Web API** — integração OAuth pra anexar músicas em stories/posts/chat (ver `docs/SPOTIFY_INTEGRATION.md`)
- **PWA** — Service Worker em `public/sw.js` (versão atual: `studentclub-sw-v274`)

---

## Estrutura de componentes principais

| Arquivo | Responsabilidade |
|---|---|
| `src/app/components/FeedNews.tsx` | Feed de posts (texto, foto, vídeo) |
| `src/app/components/FeedVideo.tsx` | Player estilo Instagram (HLS + autoplay mudo, IntersectionObserver) |
| `src/app/components/VideoEditor.tsx` | Editor de vídeo: trim (slider início/fim) + 8 filtros via canvas+MediaRecorder |
| `src/app/components/Stories.tsx` | Stories circulares (foto e vídeo, max 60s) |
| `src/app/components/HlsVideo.tsx` | Wrapper do hls.js para HLS/MP4 |
| `src/app/components/Gastos.tsx` | Painel financeiro do intercâmbio (Viagem, Chegada, Reserva) |
| `src/app/components/InfoTab.tsx` | Aba de informações (regras de bagagem, dicas, etc.) |
| `src/app/components/ChatsTab.tsx` | Lista de chats 1-1 e grupos + avatar logic |
| `src/app/components/FriendsDrawer.tsx` | Drawer lateral de amigos com status online real |
| `src/app/components/ConexoesTab.tsx` | Página `/conexoes` — gerencia integrações externas (Spotify) |
| `src/app/components/spotify/*` | Componentes Spotify (MusicPicker, TrackPlayer, etc.) |
| `src/app/hooks/useSpotifyConnection.ts` | Hook global de estado da conexão Spotify do user |
| `src/app/lib/spotify.ts` | Helpers client-side de Spotify (search, login flow, etc.) |
| `api/auth/spotify/*` | Endpoints OAuth Spotify (login, callback, disconnect, refresh) |
| `api/spotify/search.ts` | Proxy autenticado pra Spotify Web API /v1/search |
| `api/_lib/spotify-auth.ts` | Helpers servidor: crypto AES-256-GCM dos tokens, refresh automatico |
| `src/app/App.tsx` | Roteamento de tabs, scroll-to-top ao clicar em Início |
| `src/styles/index.css` | Tokens CSS de dark mode (`--sc-bg-card`, `--sc-text-primary`, etc.) |
| `public/sw.js` | Service Worker: Web Push, nudge (vibração estilo MSN), notificações |

---

## Regras do produto (não mudar sem o usuário pedir)

1. **Texto do post SEMPRE abaixo da mídia** (foto ou vídeo) — nunca acima.
2. **Story labels sem @** — exibir só `username`, não `@username`.
3. **Vídeos do feed via Cloudflare Stream** — upload pelo endpoint `/api/stream-upload-url`, entregue em HLS. Max 300s para feed, 60s para stories.
4. **Dark mode via tokens CSS** — nunca usar cores hardcoded (`#ffffff`, `#f3f4f6`, etc.) em componentes novos. Usar `var(--sc-bg-card)`, `var(--sc-text-primary)`, etc.
5. **Status online real** — `userStatuses` do Supabase Realtime. Sem simulação/fake presence.
6. **Deploy autônomo** — ciclo completo: editar → commit → push → verificar no Chrome. Não pausar no meio pedindo confirmação de deploy.

---

## Cloudflare Stream

- Upload via `/api/stream-upload-url` (TUS protocol) — retorna URL de upload e `videoId`.
- `maxDurationSeconds: 300` para feed, `60` para stories.
- URL de reprodução: `https://customer-{id}.cloudflarestream.com/{videoId}/manifest/video.m3u8`
- Minutos Cloudflare: começam a contar só depois que o vídeo é processado/armazenado.

---

## Gastos (Painel financeiro)

- **Categorias**: Viagem e Chegada (arquiváveis como barra inteira), Reserva (sem arquivo).
- **Archive**: `archivedCategories: Set<Category>` persistido em `localStorage` + Supabase `gastos_data.archivedCats`.
- Botão de arquivo aparece só nas KPI cards de Viagem e Chegada.
- Seção "Arquivados" colapsada na parte inferior da tela.

---

## Service Worker / Push

- Versão em `SW_VERSION` — bumpar para forçar reinstalação quando alterado.
- Nudge: tag `nudge-*` → vibração estilo MSN + `requireInteraction: true`.
- `PUSH_RECEIVED` message → abas abertas recebem via `postMessage`.
- `PUSH_SUBSCRIPTION_CHANGED` → cliente tenta re-subscribe.

---

## Convenções de commit

```
fix(componente): descrição curta
feat(componente): descrição curta
```

Exemplo: `fix(feed-video): altura menor no desktop`

---

## Observações técnicas importantes

- **iOS video picker**: usar `accept="video/mp4,video/quicktime,video/x-m4v,video/3gpp,video/webm,video/*,.mp4,.mov,.m4v,.3gp,.webm"` — só `video/*` é instável no iOS.
- **X button iOS (fechar modal)**: usar `onPointerDown` + `e.preventDefault()` em vez de `onClick` — o teclado virtual do iOS "engole" o primeiro `onClick` para dar blur no input.
- **FeedVideo altura atual**: `clamp(560px, 115vw, 580px)` com `object-cover`.
- **VideoEditor safe-area**: `paddingTop: calc(env(safe-area-inset-top) + 8px)` no header, `paddingBottom: calc(env(safe-area-inset-bottom) + 12px)` nos controles.
- **Scroll-to-top em Início**: em `App.tsx`, `goTo('home')` faz `window.scrollTo({ top: 0 })` se já estiver em home.
