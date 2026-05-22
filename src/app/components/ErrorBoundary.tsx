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
  }

  handleReset = () => {
    // Limpa caches que podem estar causando o crash (mantem auth pra
    // user nao precisar re-logar via senha).
    try {
      const authKeys = Object.keys(localStorage).filter(k => k.startsWith('sb-') || k.startsWith('supabase'));
      const authValues: Record<string, string> = {};
      authKeys.forEach(k => { authValues[k] = localStorage.getItem(k) || ''; });
      // Limpa TUDO exceto auth
      localStorage.clear();
      // Restaura auth
      Object.entries(authValues).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch {}
    // Reload forcando bypass do cache do SW
    try { window.location.reload(); } catch {}
  };

  handleLogout = async () => {
    try {
      const supabase = (await import('../../lib/supabase')).supabase;
      await supabase.auth.signOut();
    } catch {}
    try { localStorage.clear(); } catch {}
    try { window.location.reload(); } catch {}
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
