// Página /configuracoes/conexoes — gerencia integrações externas.
// Suporta Spotify e Deezer (cards lado a lado, mesma UI).

import { useEffect, useState } from 'react';
import { SpotifyConnectionCard } from './spotify/SpotifyConnectionCard';
import { DeezerConnectionCard } from './deezer/DeezerConnectionCard';

const SPOTIFY_ERR_MAP: Record<string, string> = {
  missing_params: 'Parâmetros faltando',
  invalid_state: 'Sessão expirada — tente novamente',
  state_expired: 'Conexão demorou demais — tente novamente',
  token_exchange: 'Erro ao trocar credenciais com Spotify',
  me_failed: 'Spotify não respondeu — tente novamente',
  db_save: 'Erro ao salvar — tente novamente',
  not_configured: 'Integração em manutenção',
};

const DEEZER_ERR_MAP: Record<string, string> = {
  missing_params: 'Parâmetros faltando',
  invalid_state: 'Sessão expirada — tente novamente',
  state_expired: 'Conexão demorou demais — tente novamente',
  token_exchange: 'Erro ao trocar credenciais com Deezer',
  me_failed: 'Deezer não respondeu — tente novamente',
  db_save: 'Erro ao salvar — tente novamente',
  not_configured: 'Integração Deezer ainda não configurada — contate o admin',
};

export function ConexoesTab() {
  const [toast, setToast] = useState<{ type: 'ok' | 'err' | 'cancel'; msg: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyStatus = params.get('spotify');
    const deezerStatus = params.get('deezer');
    const reason = params.get('reason');

    // Toast pra Spotify (mantém comportamento atual)
    if (spotifyStatus === 'ok') {
      setToast({ type: 'ok', msg: 'Spotify conectado!' });
    } else if (spotifyStatus === 'err') {
      setToast({ type: 'err', msg: SPOTIFY_ERR_MAP[reason || ''] || 'Falha ao conectar Spotify' });
    } else if (spotifyStatus === 'cancel') {
      setToast({ type: 'cancel', msg: 'Conexão cancelada' });
    }
    // Toast pra Deezer
    else if (deezerStatus === 'ok') {
      setToast({ type: 'ok', msg: 'Deezer conectado!' });
    } else if (deezerStatus === 'err') {
      setToast({ type: 'err', msg: DEEZER_ERR_MAP[reason || ''] || 'Falha ao conectar Deezer' });
    } else if (deezerStatus === 'cancel') {
      setToast({ type: 'cancel', msg: 'Conexão cancelada' });
    }

    // Limpa a query depois pra não ficar grudada
    if (spotifyStatus || deezerStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      url.searchParams.delete('deezer');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
      const t = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-20">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">Conexões</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Conecte serviços externos pra enriquecer o Student Club. Você pode desconectar a qualquer momento.
      </p>

      {toast && (
        <div
          className={`mb-4 px-4 py-3 rounded-2xl border text-sm ${
            toast.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-900 dark:text-emerald-200'
              : toast.type === 'err'
              ? 'bg-red-50 border-red-200 text-red-800 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200'
              : 'bg-gray-50 border-gray-200 text-gray-700 dark:bg-zinc-900 dark:border-zinc-700 dark:text-gray-300'
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* Spotify primeiro (integracao antiga, ja conhecida) */}
      <SpotifyConnectionCard redirectTo="/conexoes" />

      {/* Espaco entre cards */}
      <div className="h-3" />

      {/* Deezer abaixo do Spotify — mesma UI, opcao alternativa sem limite de testers */}
      <DeezerConnectionCard redirectTo="/conexoes" />
    </div>
  );
}
