-- ─── Moderação de anúncios e bloqueio de usuários ────────────────────────────
-- Execute no Supabase SQL Editor

-- 1. Campos de status na tabela usuarios
ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS status_conta    TEXT    DEFAULT 'ativa'
    CHECK (status_conta IN ('ativa', 'bloqueada')),
  ADD COLUMN IF NOT EXISTS motivo_bloqueio TEXT,
  ADD COLUMN IF NOT EXISTS bloqueado_em    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bloqueado_por   TEXT;

-- Garante que usuários existentes ficam 'ativa'
UPDATE usuarios SET status_conta = 'ativa' WHERE status_conta IS NULL;

-- 2. Função para bloquear usuário (SECURITY DEFINER — bypass RLS)
CREATE OR REPLACE FUNCTION bloquear_usuario(
  p_username  TEXT,
  p_motivo    TEXT,
  p_por       TEXT DEFAULT 'sistema_ia'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE usuarios
     SET status_conta    = 'bloqueada',
         motivo_bloqueio = p_motivo,
         bloqueado_em    = NOW(),
         bloqueado_por   = p_por
   WHERE username = p_username;
END;
$$;

-- 3. Função para desbloquear usuário (chamada pelo admin)
CREATE OR REPLACE FUNCTION desbloquear_usuario(p_username TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE usuarios
     SET status_conta    = 'ativa',
         motivo_bloqueio = NULL,
         bloqueado_em    = NULL,
         bloqueado_por   = NULL
   WHERE username = p_username;
END;
$$;

-- 4. Permissão: permite que o anon key chame essas funções via RPC
GRANT EXECUTE ON FUNCTION bloquear_usuario(TEXT, TEXT, TEXT)  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION desbloquear_usuario(TEXT)           TO anon, authenticated;

-- NOTA: desbloquear_usuario deve ser protegida em produção com verificação de admin.
-- Para maior segurança, remova a permissão do anon:
--   REVOKE EXECUTE ON FUNCTION desbloquear_usuario(TEXT) FROM anon;
-- E chame apenas com o service_role key do painel admin.
