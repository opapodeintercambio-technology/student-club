// Hook global de estado da conexão Deezer do user atual.
// Espelha useSpotifyConnection — mesma estrutura, colunas deezer_*.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { startDeezerLogin, disconnectDeezer as apiDisconnect } from '../lib/deezer';

interface DeezerConnectionState {
  connected: boolean;
  displayName: string | null;
  connectedAt: string | null;
  isLoading: boolean;
  error: string | null;
}

export function useDeezerConnection() {
  const [state, setState] = useState<DeezerConnectionState>({
    connected: false,
    displayName: null,
    connectedAt: null,
    isLoading: true,
    error: null,
  });

  const loadStatus = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState({ connected: false, displayName: null, connectedAt: null, isLoading: false, error: null });
        return;
      }
      const { data, error } = await supabase
        .from('usuarios')
        .select('deezer_user_id, deezer_display_name, deezer_connected_at')
        .eq('id', user.id)
        .maybeSingle();
      if (error) {
        setState(s => ({ ...s, isLoading: false, error: error.message }));
        return;
      }
      setState({
        connected: !!(data as any)?.deezer_user_id,
        displayName: (data as any)?.deezer_display_name || null,
        connectedAt: (data as any)?.deezer_connected_at || null,
        isLoading: false,
        error: null,
      });
    } catch (e: any) {
      setState(s => ({ ...s, isLoading: false, error: e?.message || 'Erro ao carregar status' }));
    }
  }, []);

  useEffect(() => {
    loadStatus();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      loadStatus();
    });
    return () => subscription.unsubscribe();
  }, [loadStatus]);

  useEffect(() => {
    function onFocus() { loadStatus(); }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [loadStatus]);

  const connect = useCallback(async (redirectTo: string = '/conexoes') => {
    try {
      await startDeezerLogin(redirectTo);
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

  return {
    ...state,
    connect,
    disconnect,
    reload: loadStatus,
  };
}
