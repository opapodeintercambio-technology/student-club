// <DeezerConnectionCard />
//
// Card de status do Deezer no /conexoes.
//
// IMPORTANTE: Deezer SUSPENDEU o registro de novos apps developer em 2024
// (https://en.deezercommunity.com/features-feedback-44/api-auth-impossible-80857)
// — sem como criar APP_ID/SECRET pra OAuth, então não conseguimos liberar
// fluxo "Conectar com Deezer".
//
// MAS: a integração ainda FUNCIONA via API pública do Deezer:
//   - Busca de músicas: api.deezer.com/search (sem auth)
//   - Preview 30s: track.preview (todas as músicas têm)
//   - Widget iframe nos posts/stories/chats
//
// Por isso esse card mostra "Ativo automaticamente — sem cadastro" em vez
// do botão "Conectar". Honesto e informativo. Os endpoints OAuth continuam
// no código (api/auth/deezer/*) pra quando o Deezer reabrir registros.

import { Check, Music } from 'lucide-react';

interface Props {
  /** Mantido por compatibilidade com a interface antiga, mas não usado
   *  agora que não há fluxo de OAuth. */
  redirectTo?: string;
  compact?: boolean;
}

const DEEZER_BRAND = '#00C7F2';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function DeezerConnectionCard(_props: Props = {}) {
  return (
    <div className="glass rounded-3xl overflow-hidden px-5 py-4">
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,199,242,0.10)' }}
        >
          <Music className="w-5 h-5" style={{ color: DEEZER_BRAND }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">Deezer</h4>
          <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: DEEZER_BRAND }}>
            <Check className="w-3 h-3" />
            <span>Ativo — sem cadastro</span>
          </p>
        </div>
      </div>

      <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
        Você já pode buscar músicas do Deezer e anexar em posts, stories e chats —
        sem precisar conectar uma conta. Disponível pra todos os alunos.
      </p>

      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-2 leading-relaxed">
        Pra usar, é só clicar em "Adicionar música" em qualquer post ou story
        e selecionar a aba <b style={{ color: DEEZER_BRAND }}>Deezer</b>.
      </p>
    </div>
  );
}
