
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { LangProvider } from "./app/i18n.tsx";
  import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";
  import { requestReloadOrDefer } from "./app/utils/appBusy";

  // iOS native: configuracao do teclado WKWebView.
  // 1) setAccessoryBarVisible(false) — remove a barra ^v/done que ficava
  //    grudada acima do teclado (atrapalhava o layout).
  // 2) setResizeMode(Native) — quando o teclado aparece, encolhe o frame
  //    do WKWebView. Sem isso, com a accessory bar oculta, o teclado vinha
  //    POR CIMA do conteudo e a barra input do chat ficava ABAIXO do
  //    teclado (invisivel). Native mode reduz a altura util da webview,
  //    empurrando todos os elementos pra cima junto.
  // Carregamento dinamico pra nao quebrar o build web (modulo so existe em native).
  (async () => {
    try {
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.() === true && cap.getPlatform?.() === 'ios') {
        const { Keyboard, KeyboardResize } = await import('@capacitor/keyboard');
        await Keyboard.setAccessoryBarVisible({ isVisible: false });
        await Keyboard.setResizeMode({ mode: KeyboardResize.Native });
      }
    } catch { /* plugin nao registrado em web */ }
  })();

  // iOS/Android native: StatusBar transparente em overlay + estilo dinamico
  // pra acompanhar o tema (claro/escuro) do sistema.
  //
  // HISTORICO DO BUG:
  //   v1.0(7) tinha overlaysWebView=false + backgroundColor=#ffffff. Em DARK
  //   mode do app, a faixa nativa da status bar continuava BRANCA (porque
  //   esse bg eh fixo no config), criando uma "area branca acima do header
  //   escuro" visivel pro user. Pior: sem o plugin StatusBar instalado, nao
  //   tinhamos como mudar o style dinamicamente em runtime.
  //
  // FIX (v1.0(8)):
  //   - overlaysWebView=true (capacitor.config.json): webview cobre TODA a
  //     tela ate o topo do device. O env(safe-area-inset-top) do CSS ja
  //     cuida do padding pro header nao colidir com o notch/dynamic island.
  //   - StatusBar.setStyle dinamico: Light (icones brancos) em dark mode,
  //     Dark (icones pretos) em light mode. Listener no prefers-color-scheme
  //     re-aplica quando o user troca o tema do SO.
  (async () => {
    try {
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.() !== true) return;
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      // Overlay: deixa o webview content extender ate o topo do device.
      // Sem isso, a status bar tinha sua propria area solida fora do webview
      // (foi a fonte da "faixa branca" reportada pelo user em dark mode).
      try { await StatusBar.setOverlaysWebView({ overlay: true }); } catch {}
      const applyStyle = async () => {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
          || document.documentElement.classList.contains('dark');
        try {
          await StatusBar.setStyle({ style: isDark ? Style.Light : Style.Dark });
        } catch {}
      };
      await applyStyle();
      // Atualiza dinamicamente quando o SO troca dark/light.
      try {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyStyle);
      } catch {}
    } catch { /* plugin nao registrado em web */ }
  })();

  // ─── CHUNK LOAD ERROR RECOVERY ────────────────────────────────────
  // Quando o user esta com o app carregado e fazemos um deploy novo, o
  // Vite gera chunks com hashes novos e o Vercel apaga os antigos. Se
  // o JS antigo tentar dynamic import de um chunk antigo (ChatPanel-OLD.js,
  // SettingsTab-OLD.js, etc), o fetch retorna 404 e a promise rejeita.
  // SEM esse handler, o erro sobe ate o ErrorBoundary global e o user
  // ve "Algo deu errado, limpar dados".
  //
  // Com esse handler, detectamos o padrao de chunk load failure e fazemos
  // RELOAD da pagina (que vai pegar o HTML novo + chunks novos). Reload
  // automatico maximo 1x por sessao (sessionStorage flag) pra nao entrar
  // em loop caso o erro seja de outro tipo.
  function isChunkLoadError(err: any): boolean {
    if (!err) return false;
    const msg = String(err.message || err.reason?.message || err.reason || err);
    return /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed|Failed to import/i.test(msg);
  }
  function maybeReloadOnce() {
    try {
      if (sessionStorage.getItem('papo_chunk_reload') === '1') return;
      sessionStorage.setItem('papo_chunk_reload', '1');
      console.warn('[main] chunk load error detectado — recarregando pagina');
      // requestReloadOrDefer: se app esta postando story (setAppBusy=true),
      // o reload eh adiado ate o post terminar. Sem isso, chunks orfaos
      // de deploys recentes faziam o app recarregar no meio do upload.
      requestReloadOrDefer();
    } catch { /* sessionStorage indisponivel (modo privado) — ignora */ }
  }
  window.addEventListener('error', (e) => {
    if (isChunkLoadError(e)) maybeReloadOnce();
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkLoadError(e)) maybeReloadOnce();
  });

  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <LangProvider><App /></LangProvider>
    </ErrorBoundary>
  );
