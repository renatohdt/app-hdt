-- Tabela para armazenar o token de push NATIVO (FCM) de cada aparelho.
-- Complementa push_subscriptions (que é o push WEB). Aqui ficam os tokens dos
-- apps Android/iOS instalados pelas lojas, para envio via Firebase Cloud Messaging.
CREATE TABLE IF NOT EXISTS native_push_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token       text NOT NULL,
  platform    text NOT NULL CHECK (platform IN ('ios', 'android')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  -- Cada token de aparelho é único globalmente
  UNIQUE (token)
);

-- Índice para buscar todos os tokens de um usuário
CREATE INDEX IF NOT EXISTS native_push_tokens_user_id_idx ON native_push_tokens (user_id);

-- RLS: usuário só gerencia os próprios tokens; service role tem acesso total (envio)
ALTER TABLE native_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprios tokens nativos"
  ON native_push_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário insere próprio token nativo"
  ON native_push_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário deleta próprio token nativo"
  ON native_push_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role acesso total aos tokens nativos"
  ON native_push_tokens FOR ALL
  USING (true)
  WITH CHECK (true);
