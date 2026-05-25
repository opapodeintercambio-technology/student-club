// ErrorBoundary global — captura qualquer crash do React tree e mostra
// UI de recuperacao com botao "Limpar dados e recarregar".
//
// Caso real (Andreza): rename de username deixou cache inconsistente,
// algum useEffect crashou ao carregar perfil, tela ficou totalmente
// branca. Sem ErrorBoundary, o React desmonta TUDO e nao ha recovery.
//
// Com este wrapper, mesmo que algum componente crashe, o user ve uma
// tela amigavel com opcao de limpar localStorage e re-logar.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null; errorInfo: string | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] React crashou:', error, info);
    this.setState({ errorInfo: (info.componentStack || '').slice(0, 1200) });
    // Telemetria opcional — manda erro pro console.warn em formato JSON
    // pra debug pos-mortem ate via DevTools remoto (Safari).
    try {
      const payload = {
        msg: error.message,
        stack: (error.stack || '').slice(0, 800),
        componentStack: (info.componentStack || '').slice(0, 800),
        url: window.location.href,
        user: localStorage.getItem('papo_username'),
        ua: navigator.userAgent.slice(0, 200),
      };
      console.warn('[ErrorBoundary] payload:', JSON.stringify(payload));
    } catch {}
    // CHUNK LOAD AUTO-RECOVERY: se o erro foi um dynamic import falhando
    // (deploy novo, chunk antigo deletado do server), recarrega a pagina
    // automaticamente — usuario nem ve a tela de erro. Maximo 1x por
    // sessao pra evitar loop infinito caso o erro persista.
    try {
      const msg = String(error?.message || '');
      const isChunkLoadError = /Failed to fetch dynamically imported module|Loading chunk \d+ failed|Importing a module script failed|Failed to import/i.test(msg);
      if (isChunkLoadError && sessionStorage.getItem('papo_chunk_reload') !== '1') {
        sessionStorage.setItem('papo_chunk_reload', '1');
        console.warn('[ErrorBoundary] chunk load error — recarregando');
        // Pequeno delay pra console.warn imprimir antes do reload
        setTimeout(() => window.location.reload(), 100);
      }
    } catch {}
  }

  /** Limpeza nuclear — caches do SW, service worker registrations,
   *  localStorage, sessionStorage. Usado pelos dois botoes pra garantir
   *  que NENHUM resquicio cached fique pra trash o proximo boot. */
  private async nukeAllCaches(): Promise<void> {
    try {
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.unregister().catch(() => false)));
      }
    } catch {}
    try {
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k).catch(() => false)));
      }
    } catch {}
  }

  handleReset = async () => {
    // CRITICO: limpa SW + caches PRIMEIRO. Antes so limpava localStorage
    // e fazia reload — mas o SW antigo ainda servia HTML/JS podre do
    // cache, ai o usuario caia no MESMO loop "Algo deu errado" apos
    // clicar em "Limpar dados". Agora limpa TUDO antes do reload.
    try {
      // Preserva auth pra user nao precisar re-logar via senha
      const authKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('supabase'));
      const authValues: Record<string, string> = {};
      authKeys.forEach(k => { authValues[k] = localStorage.getItem(k) || ''; });
      await this.nukeAllCaches();
      localStorage.clear();
      Object.entries(authValues).forEach(([k, v]) => localStorage.setItem(k, v));
      try { sessionStorage.clear(); } catch {}
    } catch {}
    // Reload forcando bypass do cache do browser (alguns browsers respeitam)
    try { (window.location as any).reload(true); } catch { window.location.reload(); }
  };

  handleLogout = async () => {
    try {
      const supabase = (await import('../../lib/supabase')).supabase;
      await supabase.auth.signOut();
    } catch {}
    try { await this.nukeAllCaches(); } catch {}
    try { localStorage.clear(); } catch {}
    try { sessionStorage.clear(); } catch {}
    try { (window.location as any).reload(true); } catch { window.location.reload(); }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#fff',
        color: '#1f2937',
        fontFamily: '-apple-system, "DM Sans", system-ui, sans-serif',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: '#1e714a' }}>
          Algo deu errado
        </h1>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, maxWidth: 400 }}>
          Encontramos um problema ao carregar o app. Limpar os dados locais costuma
          resolver — sua conta e mensagens ficam intactas.
        </p>

        <button
          type="button"
          onClick={this.handleReset}
          style={{
            background: '#1e714a',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: 999,
            border: 'none',
            fontWeight: 700,
            fontSize: 14,
            marginBottom: 12,
            cursor: 'pointer',
            width: '100%',
            maxWidth: 320,
          }}
        >
          Limpar dados e recarregar
        </button>

        <button
          type="button"
          onClick={this.handleLogout}
          style={{
            background: 'transparent',
            color: '#6b7280',
            padding: '10px 20px',
            borderRadius: 999,
            border: '1px solid #d1d5db',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
            width: '100%',
            maxWidth: 320,
          }}
        >
          Sair da conta e tentar de novo
        </button>

        {/* Detalhes tecnicos (so visivel se o user expandir) */}
        <details style={{ marginTop: 24, maxWidth: 480, width: '100%', textAlign: 'left' }}>
          <summary style={{ fontSize: 11, color: '#9ca3af', cursor: 'pointer' }}>
            Detalhes técnicos (envie isso ao suporte se o problema persistir)
          </summary>
          <pre style={{
            fontSize: 10,
            color: '#6b7280',
            background: '#f9fafb',
            padding: 12,
            borderRadius: 8,
            marginTop: 8,
            overflow: 'auto',
            maxHeight: 200,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}>
            {this.state.error?.message || 'unknown'}
            {'\n\n'}
            {(this.state.error?.stack || '').slice(0, 600)}
          </pre>
        </details>
      </div>
    );
  }
}
