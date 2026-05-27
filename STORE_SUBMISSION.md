# Student Club — Guia de Submissão App Store + Google Play

> **Status atual:** App preparado, falta gerar keystore + assets + criar contas dev.
> **Bundle ID unificado:** `com.studentclub.app`
> **Versão inicial:** 1.0.0 (build 1)

---

## ✅ JÁ FEITO neste preparativo

1. **Capacitor config** (`capacitor.config.json`) → `appId: com.studentclub.app`, `appName: Student Club`
2. **iOS** (`ios/App/App/Info.plist`):
   - `CFBundleDisplayName`: Student Club
   - Permissões (NSCameraUsage, NSPhotoLibrary, NSMicrophone, NSLocation) atualizadas com textos do Student Club
3. **iOS** (`project.pbxproj`):
   - `PRODUCT_BUNDLE_IDENTIFIER`: `com.studentclub.app`
   - `MARKETING_VERSION`: 1.0.0
   - `CURRENT_PROJECT_VERSION`: 1
4. **Android** (`build.gradle`):
   - `namespace` + `applicationId`: `com.studentclub.app`
   - `versionCode`: 1, `versionName`: 1.0.0
   - **Signing** agora via `keystore.properties` (fora do repo, seguro)
5. **Android** (`strings.xml`):
   - `app_name`, `package_name`, `custom_url_scheme` → Student Club / com.studentclub.app
6. **Android** (`MainActivity.java`):
   - Pacote movido pra `com.studentclub.app`
7. **package.json**:
   - `name: student-club`, `version: 1.0.0`
   - Novos scripts: `build:ios`, `build:android`, `android:release`, `icons:generate`
8. **.gitignore**:
   - Bloqueia `.jks`, `keystore.properties`, `google-services.json`, `GoogleService-Info.plist`

---

## 🔐 1. GERAR KEYSTORE Android (obrigatório pra Play Store)

```bash
cd android
keytool -genkey -v -keystore studentclub-release.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias studentclub

# Quando pedir, anote a senha (vai precisar nos próximos passos)
# Common Name (first/last name): Student Club
# Organization: Student Club
# Country: BR
```

**Criar `android/keystore.properties`** (NÃO comitar):
```properties
storeFile=studentclub-release.jks
storePassword=SUA_SENHA_DO_KEYSTORE
keyAlias=studentclub
keyPassword=SUA_SENHA_DA_KEY
```

⚠️ **GUARDE O .jks E SENHAS EM LUGAR SEGURO!** Sem o keystore original você não consegue mais publicar updates do app (Google Play exige a mesma assinatura). Recomendado: 1Password / Bitwarden / Google Drive privado.

---

## 🎨 2. GERAR ÍCONES E SPLASH SCREENS

Os assets nativos (iOS Asset Catalog + Android mipmap) vêm do PWA. Coloque um ícone source de **1024×1024 px PNG** em `resources/icon.png` e splash **2732×2732 px** em `resources/splash.png`:

```bash
mkdir resources
# Copie suas imagens source pra resources/icon.png e resources/splash.png
npm run icons:generate
```

Isso popula automaticamente:
- iOS: `ios/App/App/Assets.xcassets/AppIcon.appiconset/`
- Android: `android/app/src/main/res/mipmap-*/`
- Splash screens em ambos

---

## 🍎 3. App Store (iOS)

### Pré-requisitos
- Mac com Xcode 15+
- Apple Developer account ($99/ano) — https://developer.apple.com/programs/
- App Store Connect: https://appstoreconnect.apple.com/

### Passos
1. **Criar App ID** no Apple Developer Portal:
   - Bundle ID: `com.studentclub.app`
   - Capabilities: Push Notifications, Sign in with Apple (se for usar)

2. **Build no Xcode**:
   ```bash
   npm run build:ios   # roda vite build + cap sync + abre Xcode
   ```

3. **Configurar Signing no Xcode**:
   - Selecione o target "App" → tab "Signing & Capabilities"
   - Team: seu Apple Developer team
   - Provisioning: Automatic
   - Push Notifications: adicione a capability

4. **Archive e Upload**:
   - Xcode → Product → Destination: Any iOS Device (arm64)
   - Product → Archive (5-10 min)
   - Window → Organizer → seleciona o archive → "Distribute App" → "App Store Connect"

5. **App Store Connect**:
   - Cadastre o app (My Apps → +)
   - Bundle ID: `com.studentclub.app`
   - Preencha screenshots (6.7", 6.5", 5.5" obrigatórios) + descrição + privacy
   - Submit for Review

### Screenshots iOS (resoluções obrigatórias)
- iPhone 6.7" (iPhone 15 Pro Max): 1290×2796 ou 1320×2868
- iPhone 6.5" (iPhone XS Max): 1242×2688
- iPhone 5.5" (iPhone 8 Plus): 1242×2208

---

## 🤖 4. Google Play (Android)

### Pré-requisitos
- Google Play Console account ($25 único) — https://play.google.com/console
- Keystore gerado (passo 1)
- google-services.json do Firebase (já existe em `android/app/`)

### Passos
1. **Build do AAB (Android App Bundle)**:
   ```bash
   npm run android:release
   # Gera: android/app/build/outputs/bundle/release/app-release.aab
   ```

2. **Play Console**:
   - Criar app (My Apps → Create app)
   - Package name: `com.studentclub.app`
   - Categoria: Social / Education
   - Idioma: Português (Brasil)

3. **Internal Testing primeiro** (recomendado):
   - Release → Testing → Internal testing → Create release
   - Upload do `app-release.aab`
   - Add testers (email)

4. **Production release**:
   - Quando estiver estável, promova pra Production
   - Submit pra revisão (Google geralmente 1-3 dias)

### Screenshots Android (resoluções)
- Telefone: 1080×1920 (mínimo 2, máximo 8)
- Tablet 7": 1024×600 (opcional)
- Feature Graphic: 1024×500 (obrigatório)

---

## 📋 5. CHECKLIST FINAL (antes de submeter)

### Conteúdo obrigatório (para ambas stores)
- [ ] **Política de Privacidade** publicada em URL (ex: https://studentclub.app/privacy)
- [ ] **Termos de Uso** publicados (ex: https://studentclub.app/terms)
- [ ] **Ícone 1024×1024** sem transparência, sem cantos arredondados
- [ ] **Screenshots** em todas as resoluções
- [ ] **Descrição curta** (80 chars) + **longa** (4000 chars)
- [ ] **Email de suporte**: suporte@studentclub.app
- [ ] **Categorias**: Social Networking / Education

### Compliance específico
- [ ] **Apple**: declarar uso de IDFA (se houver), encryption (geralmente "exempt"), Apple ID se for usar Sign in
- [ ] **Google**: Data Safety form (declare que coleta email, location, photos, audio — tudo pra funcionalidade do app)
- [ ] **Idade**: 13+ (COPPA) — Student Club é pra universitários
- [ ] **Resend / Spotify / Cloudflare / Supabase** declarados como SDKs no Data Safety

### Tech checks
- [ ] Tirar todas as flags de debug (logs em produção)
- [ ] Testar push notifications nas duas plataformas
- [ ] Testar fluxo completo: signup → onboarding → postar → chatear → logout
- [ ] Testar em pelo menos 2 devices reais (1 iOS, 1 Android)
- [ ] Verificar permissions descriptions (todas em PT)

---

## 🚀 6. COMANDOS RÁPIDOS

```bash
# Build web + sync nativos
npm run build:mobile

# Abrir projeto iOS no Xcode
npm run open:ios

# Abrir projeto Android no Android Studio
npm run open:android

# Build release Android (AAB pra Play Store)
npm run android:release

# Gerar ícones e splash a partir de resources/icon.png + splash.png
npm run icons:generate
```

---

## 📞 SUPORTE

- App Store guidelines: https://developer.apple.com/app-store/review/guidelines/
- Play Store policy: https://play.google.com/about/developer-content-policy/
- Capacitor docs: https://capacitorjs.com/docs/

---

**Última atualização:** preparativo inicial pra submissão v1.0.0.
