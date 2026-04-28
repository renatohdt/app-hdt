-- Tabela para armazenar push subscriptions de cada dispositivo do usuário
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),

  -- Um endpoint é único globalmente (cada dispositivo/browser tem o seu)
  UNIQUE (endpoint)
);

-- Índice para buscar todas as subscriptions de um usuário
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx ON push_subscriptions (user_id);

-- RLS: usuário só vê e gerencia as próprias subscriptions
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário lê próprias subscriptions"
  ON push_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuário insere própria subscription"
  ON push_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuário deleta própria subscription"
  ON push_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

-- Service role tem acesso total (para o server enviar notificações)
CREATE POLICY "Service role acesso total"
  ON push_subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);
