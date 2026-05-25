// ErrorBoundary LOCAL pra cada mensagem do chat. Quando uma mensagem
// especifica crasha (ex: track de musica com fields null, JSON corrompido,
// audio.play() lancando excecao sincrona), so AQUELA mensagem mostra um
// fallback discreto — o resto do ChatPanel continua funcionando.
//
// Sem isso, qualquer crash em qualquer mensagem derrubava o ChatPanel
// inteiro e disparava o ErrorBoundary GLOBAL ("Algo deu errado"), forcando
// o user a limpar o cache pra voltar.

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Texto que aparece quando a mensagem crasha. Default: "Mensagem indisponivel". */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MessageErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[MessageErrorBoundary] mensagem crashou:', error?.message, info?.componentStack?.slice(0, 200));
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;
      return (
        <div
          className="px-3 py-2 rounded-2xl text-xs italic"
          style={{
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.55)',
            border: '1px dashed rgba(255,255,255,0.15)',
            maxWidth: 280,
          }}
        >
          ⚠️ Mensagem indisponível
        </div>
      );
    }
    return this.props.children;
  }
}
