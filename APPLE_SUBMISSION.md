# 🍎 Submissão App Store — Student Club v1.0.0

> Foco: SÓ Apple. Google Play depois.
> Bundle ID: `com.studentclub.app`

---

## ✅ STATUS DO PROJETO (já pronto)

- App ID nativo: `com.studentclub.app`
- Nome: Student Club
- Versão: 1.0.0 (build 1)
- Ícone: Student Club logo no Assets.xcassets ✓
- Splash: logo no bg dark `#0c1014` ✓
- Permissões (Camera, Photos, Microphone, Location): textos prontos em PT ✓
- LSRequiresIPhoneOS: true ✓
- Portrait only: true ✓

---

## PASSO 1 — Apple Developer Account

Se ainda não tem:
1. Vá em https://developer.apple.com/programs/
2. Enroll ($99/ano, US$ ~520 BRL)
3. Aguarda 24-48h pra ativação
4. Confirma email + pagamento

**Já tem?** Pula pro Passo 2.

---

## PASSO 2 — Criar App ID no Developer Portal

1. Login em https://developer.apple.com/account/
2. "Certificates, Identifiers & Profiles" → "Identifiers" → "+"
3. Selecione "App IDs" → Continue → "App"
4. **Description**: Student Club
5. **Bundle ID** (Explicit): `com.studentclub.app`
6. **Capabilities** (marque os que vamos usar):
   - ☑ Push Notifications
   - ☑ Associated Domains (se for usar deep links)
   - ☑ Sign In with Apple (opcional, mas recomendado)
7. Continue → Register

---

## PASSO 3 — Abrir o Xcode

Aqui no terminal:

```bash
cd "/Users/gui_mac/Documents/PROJETOS CODE/papo-de-alunos"
npm run build:ios
```

Isso roda:
1. `vite build` → gera dist/
2. `cap sync ios` → copia dist + plugins pro iOS project
3. Abre o Xcode automaticamente

---

## PASSO 4 — Configurar Signing no Xcode

No Xcode com o projeto "App" aberto:

1. **No painel esquerdo**, clique no projeto **"App"** (azul, topo)
2. Selecione o **target "App"** (no centro, abaixo de "TARGETS")
3. Tab **"Signing & Capabilities"**:
   - ☑ **Automatically manage signing**
   - **Team**: selecione seu Apple Developer Team
   - **Bundle Identifier**: `com.studentclub.app` (já está)
   - Se der erro de provisioning, clique "Try Again"
4. **Capabilities** (botão "+ Capability"):
   - Push Notifications
   - (Background Modes opcional: Remote notifications)

---

## PASSO 5 — Build no Xcode (Archive)

1. Topo do Xcode: selecione o destino **"Any iOS Device (arm64)"** (não simulator!)
2. Menu: **Product → Archive**
3. Espera 5-10 min (compilação completa)
4. Quando terminar, abre o **Organizer** automaticamente
5. Selecione o archive recém-criado
6. Clique **"Distribute App"**
7. Selecione **"App Store Connect"** → Next
8. **"Upload"** → Next (a outra opção é Export pra fora)
9. Marque ☑ "Upload your app's symbols" (pra crash reports)
10. ☑ "Manage Version and Build Number" (Xcode auto-incrementa)
11. Next → Next → **Upload**
12. Espera ~5 min upload + processing

---

## PASSO 6 — App Store Connect (Metadata)

1. Vá em https://appstoreconnect.apple.com
2. **My Apps** → "+" → **New App**
3. Preencha:
   - **Platforms**: iOS
   - **Name**: Student Club
   - **Primary Language**: Portuguese (Brazil)
   - **Bundle ID**: com.studentclub.app (vai aparecer no dropdown)
   - **SKU**: studentclub-001 (livre, identificador interno)
4. Após criar, vai pra página do app
5. **App Information**:
   - **Subtitle** (30 chars): "Rede de intercambistas"
   - **Category**: Primary: Social Networking. Secondary: Education
   - **Content Rights**: "Does not use third-party content"

---

## PASSO 7 — Preencher a Versão 1.0.0

Na sidebar: **iOS App → 1.0 Prepare for Submission**

### 7.1 — Screenshots (obrigatório)

Apple aceita 1 device size obrigatório (preferido o maior):
- **6.7"** (iPhone 15 Pro Max / 14 Pro Max): 1290×2796 OU 1320×2868
- Mínimo: 3 screenshots, máximo: 10

**Como capturar:**
- Use simulator no Xcode (Simulator → File → New Simulator → iPhone 15 Pro Max)
- Ou direto do device físico (Settings → Screenshot → tirar)
- Edite/anote em ferramentas tipo [Mockuphone](https://mockuphone.com/) ou screenshots reais

### 7.2 — App Preview Video (opcional)
- 15-30s mostrando o app em uso
- Pode pular pra v1

### 7.3 — Descrição (obrigatório)

**Promotional Text** (170 chars):
```
A rede social dos intercambistas brasileiros: feed, stories, chat, eventos e dicas pra sua jornada fora.
```

**Description** (máx 4000 chars) — exemplo:
```
Student Club é a rede social criada exclusivamente pra intercambistas brasileiros que estão (ou planejam estar) fora do país.

✦ FEED — Compartilhe seus stories de intercâmbio em fotos, vídeos e posts. Veja o que outros alunos estão vivendo no exterior em tempo real.

✦ STORIES 24h — Como o Instagram, mas focado em quem está vivendo o sonho do intercâmbio.

✦ CHAT bilíngue — Converse com amigos brasileiros e estrangeiros. Tradução automática de áudios e mensagens em português, inglês, espanhol, francês, alemão, italiano, japonês.

✦ PAINEL DE GASTOS — Acompanhe os custos da sua viagem, chegada e reserva. Saiba quanto está gastando em moeda local e em real.

✦ CHECKLIST DO INTERCÂMBIO — Lista completa de documentos, vacinas, passaporte, visto, financeiro e moradia.

✦ MAPA DE INTERCAMBISTAS — Encontre brasileiros perto de você em qualquer cidade do mundo.

✦ EVENTOS — Veja meetups, festas e atividades organizadas pela comunidade no seu destino.

A plataforma feita por intercambistas, pra intercambistas. Conecte-se, compartilhe, aprenda.
```

**Keywords** (100 chars total, vírgula-separadas):
```
intercâmbio,estudante,exchange,viagem,rede social,brasileiros,exterior,erasmus,wwoofing,viajar
```

### 7.4 — Support URL (obrigatório)
- https://studentclub.app
- ou um link de suporte específico

### 7.5 — Marketing URL (opcional)
- https://studentclub.app

### 7.6 — Privacy Policy URL (OBRIGATÓRIO)
Apple exige antes de aprovar. Você precisa ter:
- https://studentclub.app/privacy

Se não tem ainda: crie uma página simples no Vercel com texto padrão de política de privacidade descrevendo:
- Dados coletados (email, foto, posts, localização)
- Como usa (mostrar feed, conectar usuários)
- Compartilhamento com 3rd party (Supabase, Cloudflare, Resend, Spotify, Groq)
- Direitos do usuário (LGPD)

### 7.7 — Build (Apple Build Number)
Vai aparecer "Build" — clique **"+"** ao lado, selecione o build que você acabou de upload (Passo 5). Pode demorar 5-15 min pra aparecer.

### 7.8 — App Privacy
Apple → App Privacy → "Get Started":
- **Data Used to Track You**: None (não usamos tracking)
- **Data Linked to You**:
  - Contact Info: Email, Name
  - User Content: Photos/Videos, Audio, Customer Support
  - Identifiers: User ID
  - Usage Data: Product Interaction
  - Location: Coarse Location (opt-in)
- **Data Not Linked to You**: Diagnostics (crashes)

---

## PASSO 8 — Age Rating

1. Edit → preencher:
   - Cartoon/Fantasy Violence: None
   - Realistic Violence: None
   - Sexual Content: None
   - Profanity: None
   - Alcohol/Tobacco/Drugs: None
   - Mature/Suggestive Themes: None
   - Horror/Fear: None
   - Gambling: None
   - **Unrestricted Web Access**: ❌ NO (importante!)
   - **User Generated Content**: ☑ YES
2. Resultado: 12+ (devido ao UGC)

---

## PASSO 9 — App Review Information

- **Sign-in Required**: ☑ YES
- Forneça credenciais demo:
  - **Username**: revisor@studentclub.app
  - **Password**: ReviewerApple2026!
  - (Crie uma conta de teste antes!)
- **Notes**: "Conta demo criada pra review da Apple. Após login, navegue pelo feed, stories, chat. Para testar push notifications, peça pra outro usuário enviar mensagem."

---

## PASSO 10 — SUBMIT

Quando TUDO estiver preenchido (sem avisos amarelos):

1. Topo da página, **"Add for Review"**
2. Responda:
   - **Export Compliance**: Encryption? ☑ "No" (se usa só HTTPS padrão)
     OU "Yes" + "Exempt from export compliance" (App uses only HTTPS)
   - **Content Rights**: "Does it contain third-party content?" No
   - **Advertising Identifier (IDFA)**: No
3. **Submit for Review**

**Tempo médio de review da Apple: 24-48h.** Pode pedir esclarecimentos por email.

---

## 🔥 PROBLEMAS COMUNS

| Erro | Solução |
|---|---|
| "Bundle ID already exists" | Outro app já usa esse ID. Mude pra `com.studentclub.app2` ou similar. |
| "Missing Privacy Policy" | Cadastre URL antes de submeter. |
| "Missing Screenshots" | Mínimo 3 screenshots no iPhone 6.7" |
| "Crash on launch" | Logs no Xcode Organizer → Crashes. Geralmente plugin Capacitor desatualizado. Roda `npx cap sync ios` de novo. |
| "Privacy Manifest" warning | Apple agora exige `PrivacyInfo.xcprivacy`. Capacitor plugins geram automaticamente. |
| Rejected: "App needs to declare reason for API usage" | Adicione mais detalhes nas permissions descriptions no Info.plist |

---

## ✅ CHECKLIST FINAL ANTES DE SUBMETER

- [ ] Apple Developer account ativa
- [ ] App ID `com.studentclub.app` criado no Developer Portal
- [ ] Xcode signing OK (no errors)
- [ ] Archive feito + Upload OK
- [ ] Build aparece no App Store Connect
- [ ] Screenshots iPhone 6.7" (mín 3)
- [ ] Descrição + keywords preenchidos
- [ ] Privacy Policy URL público funcionando
- [ ] App Privacy declarations preenchidas
- [ ] Age rating 12+
- [ ] Demo account criada pra review
- [ ] App Review Information com instruções
- [ ] Export compliance respondido

**TUDO OK → "Add for Review" → "Submit"**

---

Bons amigos do TestFlight são bem-vindos antes da submissão final (Internal Testing no App Store Connect).
