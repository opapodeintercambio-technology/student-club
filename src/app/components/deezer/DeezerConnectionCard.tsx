// <DeezerConnectionCard />
//
// Card que mostra o estado da conexão Deezer do user e permite
// conectar/desconectar. Espelha SpotifyConnectionCard.

import { useState } from 'react';
import { Check, ExternalLink, AlertCircle, Music } from 'lucide-react';
import { useDeezerConnection } from '../../hooks/useDeezerConnection';

interface Props {
  redirectTo?: string;
  compact?: boolean;
}

const DEEZER_BRAND = '#00C7F2';

export function DeezerConnectionCard({ redirectTo = '/conexoes', compact = false }: Props) {
  const { connected, displayName, connectedAt, isLoading, error, connect, disconnect } = useDeezerConnection();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  if (isLoading) {
    return (
      <div className={compact ? '' : 'glass rounded-3xl overflow-hidden px-5 py-4'}>
        <p className="text-sm text-gray-500">Carregando…</p>
      </div>
    );
  }

  const formattedDate = connectedAt
    ? new Date(connectedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;

  return (
    <div className={compact ? '' : 'glass rounded-3xl overflow-hidden px-5 py-4'}>
      <div className="flex items-center gap-3 mb-3">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
          style={{ background: 'rgba(0,199,242,0.10)' }}
        >
          <Music className="w-5 h-5" style={{ color: DEEZER_BRAND }} />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">Deezer</h4>
          {connected ? (
            <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: DEEZER_BRAND }}>
              <Check className="w-3 h-3" />
              <span className="truncate">Conectado como {displayName || 'usuário Deezer'}</span>
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Sem cadastro de testers — disponível pra todos
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 flex gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {connected ? (
        <>
          {formattedDate && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-3">
              Conectado em {formattedDate}
            </p>
          )}
          {confirmingDisconnect ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                Vai desvincular sua conta Deezer do Student Club. Você ainda pode buscar e ouvir prévias sem conectar.
                Pra revogar acesso totalmente, vá em{' '}
                <a
                  href="https://www.deezer.com/account/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline inline-flex items-center gap-0.5"
                >
                  deezer.com/account/apps <ExternalLink className="w-3 h-3" />
                </a>
              </p>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setConfirmingDisconnect(false)}
                  className="flex-1 py-2 rounded-full text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 active:scale-95 transition-transform"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => { disconnect(); setConfirmingDisconnect(false); }}
                  className="flex-1 py-2 rounded-full text-xs font-bold text-white active:scale-95 transition-transform"
                  style={{ background: '#dc2626' }}
                >
                  Desconectar
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDisconnect(true)}
              className="w-full py-2 rounded-full text-xs font-bold bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-200 active:scale-95 transition-transform"
            >
              Desconectar
            </button>
          )}
        </>
      ) : (
        <button
          type="button"
          onClick={() => connect(redirectTo)}
          className="w-full py-2.5 rounded-full text-sm font-bold text-white active:scale-95 transition-transform flex items-center justify-center gap-2"
          style={{ background: DEEZER_BRAND }}
        >
          <Music className="w-4 h-4" />
          Conectar Deezer
        </button>
      )}
    </div>
  );
}
