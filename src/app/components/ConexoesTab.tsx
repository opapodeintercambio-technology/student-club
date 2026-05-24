// Página /configuracoes/conexoes — gerencia integrações externas.
// Por enquanto só Spotify; pode crescer (Apple Music, Instagram, etc.).
//
// Renderizada via `activeTab === 'conexoes'` no App.tsx.

import { useEffect, useState } from 'react';
import { SpotifyConnectionCard } from './spotify/SpotifyConnectionCard';

export function ConexoesTab() {
  // Toast quando volta do callback OAuth (?spotify=ok ou ?spotify=err)
  const [toast, setToast] = useState<{ type: 'ok' | 'err' | 'cancel'; msg: string } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const spotifyStatus = params.get('spotify');
    const reason = params.get('reason');
    if (spotifyStatus === 'ok') {
      setToast({ type: 'ok', msg: 'Spotify conectado!' });
    } else if (spotifyStatus === 'err') {
      const msgMap: Record<string, string> = {
        missing_params: 'Parâmetros faltando',
        invalid_state: 'Sessão expirada — tente novamente',
        state_expired: 'Conexão demorou demais — tente novamente',
        token_exchange: 'Erro ao trocar credenciais com Spotify',
        me_failed: 'Spotify não respondeu — tente novamente',
        db_save: 'Erro ao salvar — tente novamente',
        not_configured: 'Integração em manutenção',
      };
      setToast({ type: 'err', msg: msgMap[reason || ''] || 'Falha ao conectar' });
    } else if (spotifyStatus === 'cancel') {
      setToast({ type: 'cancel', msg: 'Conexão cancelada' });
    }
    // Limpa a query depois pra não ficar grudada
    if (spotifyStatus) {
      const url = new URL(window.location.href);
      url.searchParams.delete('spotify');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
      // Auto-dismiss em 5s
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

      <SpotifyConnectionCard redirectTo="/conexoes" />

      {/* Espaço pra futuras integrações */}
      {/* <AppleMusicConnectionCard /> etc. */}
    </div>
  );
}
