// Hook global de estado da conexão Spotify do user atual.
//
// - Carrega status do banco (spotify_user_id, display_name, expires_at)
// - Expõe: connected, displayName, connectedAt, isLoading, refresh, disconnect
// - Não persiste tokens no client — só metadados de "está conectado?"
//
// Como o status muda apenas em momentos discretos (callback OAuth ou
// disconnect), não usamos realtime — só refresh manual após eventos.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  startSpotifyLogin,
  disconnectSpotify as apiDisconnect,
  refreshSpotifyConnection,
} from '../lib/spotify';

interface SpotifyConnectionState {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useSpotifyConnection() {
  const [state, setState] = useState<SpotifyConnectionState>({
    connected: false,
    displayName: null,
    connectedAt: null,
    isLoading: true,
    error: null,
  });

  // ─── Carrega status do DB ────────────────────────────────────────
  const loadStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ connected: false, displayName: null, connectedAt: null, isLoading: false, error: null });
        return;
      }
      const { data, error } = await supabase
        .from('usuarios')
        .select('spotify_user_id, spotify_display_name, spotify_connected_at')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        setState(s => ({ ...s, isLoading: false, error: error.message }));
        return;
      }
      setState({
        connected: !!(data as any)?.spotify_user_id,
        displayName: (data as any)?.spotify_display_name || null,
        connectedAt: (data as any)?.spotify_connected_at || null,
        isLoading: false,
        error: null,
      });
    } catch (e: any) {
      setState(s => ({ ...s, isLoading: false, error: e?.message || 'Erro ao carregar status' }));
    }
  }, []);

  useEffect(() => {
    loadStatus();
    // Recarrega quando a auth do Supabase muda (login/logout)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadStatus();
    });
    return () => subscription.unsubscribe();
  }, [loadStatus]);

  // ─── Recarrega quando o user volta de /api/auth/spotify/callback ─
  // O callback redireciona pra /conexoes?spotify=ok — detectamos via
  // listener de focus + checagem de query string na mount inicial.
  useEffect(() => {
    function onFocus() { loadStatus(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStatus]);

  // ─── Actions ─────────────────────────────────────────────────────
  const connect = useCallback(async (redirectTo: string = '/conexoes') => {
    try {
      await startSpotifyLogin(redirectTo);
      // startSpotifyLogin faz navegação completa — o componente nem
      // volta aqui antes de sair pra Spotify.
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message || 'Falha ao conectar' }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await apiDisconnect();
      setState({ connected: false, displayName: null, connectedAt: null, isLoading: false, error: null });
    } catch (e: any) {
      setState(s => ({ ...s, error: e?.message || 'Falha ao desconectar' }));
    }
  }, []);

  const refresh = useCallback(async () => {
    setState(s => ({ ...s, isLoading: true }));
    const result = await refreshSpotifyConnection();
    if (result) {
      setState({
        connected: true,
        displayName: result.display_name,
        connectedAt: state.connectedAt,
        isLoading: false,
        error: null,
      });
    } else {
      // null = não conectado ou refresh falhou
      await loadStatus();
    }
  }, [loadStatus, state.connectedAt]);

  return {
    ...state,
    connect,
    disconnect,
    refresh,
    reload: loadStatus,
  };
}
