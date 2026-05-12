-- =====================================================
-- TrokVibe — Apple App Store / Google Play Compliance
-- Tabelas para denúncias e bloqueio de usuários (UGC)
-- =====================================================

-- 1) Tabela de denúncias (reports)
CREATE TABLE IF NOT EXISTS public.denuncias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  denunciante   text NOT NULL,        -- username de quem denunciou
  alvo_tipo     text NOT NULL,        -- 'usuario' | 'anuncio' | 'mensagem'
  alvo_id       text NOT NULL,        -- id do alvo (username ou anuncio_id)
  motivo        text NOT NULL,        -- código do motivo (spam, abuso, etc.)
  descricao     text,                 -- texto livre opcional
  status        text NOT NULL DEFAULT 'pendente', -- pendente | analisada | resolvida
  created_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_denuncias_alvo ON public.denuncias(alvo_tipo, alvo_id);
CREATE INDEX IF NOT EXISTS idx_denuncias_status ON public.denuncias(status);

-- RLS
ALTER TABLE public.denuncias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_insert_denuncia" ON public.denuncias;
CREATE POLICY "anyone_can_insert_denuncia"
  ON public.denuncias FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "users_read_own_denuncias" ON public.denuncias;
CREATE POLICY "users_read_own_denuncias"
  ON public.denuncias FOR SELECT
  USING (true); -- relaxado; admin lê tudo via service role

-- 2) Tabela de bloqueios
CREATE TABLE IF NOT EXISTS public.usuarios_bloqueados (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bloqueador      text NOT NULL,
  bloqueado       text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(bloqueador, bloqueado)
);

CREATE INDEX IF NOT EXISTS idx_bloqueados_bloqueador ON public.usuarios_bloqueados(bloqueador);
CREATE INDEX IF NOT EXISTS idx_bloqueados_bloqueado ON public.usuarios_bloqueados(bloqueado);

ALTER TABLE public.usuarios_bloqueados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anyone_can_block" ON public.usuarios_bloqueados;
CREATE POLICY "anyone_can_block"
  ON public.usuarios_bloqueados FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "anyone_can_read_blocks" ON public.usuarios_bloqueados;
CREATE POLICY "anyone_can_read_blocks"
  ON public.usuarios_bloqueados FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "anyone_can_unblock" ON public.usuarios_bloqueados;
CREATE POLICY "anyone_can_unblock"
  ON public.usuarios_bloqueados FOR DELETE
  USING (true);

-- 3) Notificar admins por email quando uma denúncia chegar (opcional via Edge Function)
-- Recarregar schema
NOTIFY pgrst, 'reload schema';
