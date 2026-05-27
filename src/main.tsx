
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { LangProvider } from "./app/i18n.tsx";
  import { ErrorBoundary } from "./app/components/ErrorBoundary.tsx";

  // iOS native: esconde a barra de prev/next/done (input accessory) que
  // aparece acima do teclado em form fields. Atrapalha o layout do chat.
  // Carregamento dinamico pra nao quebrar o build web (modulo so existe em native).
  (async () => {
    try {
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.() === true && cap.getPlatform?.() === 'ios') {
        const { Keyboard } = await import('@capacitor/keyboard');
        await Keyboard.setAccessoryBarVisible({ isVisible: false });
      }
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
      window.location.reload();
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
