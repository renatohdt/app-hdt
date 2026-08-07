-- Notificações push AGENDADAS pelo admin (Fase B).
-- Um job (cron) periódico dispara as que chegaram na hora (status 'pending' e
-- scheduled_for <= now). Envio real reaproveita dispatchPushToAudience.
CREATE TABLE IF NOT EXISTS scheduled_notifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  body          text NOT NULL,
  url           text NOT NULL DEFAULT '/dashboard',
  audience      text NOT NULL CHECK (audience IN ('all', 'premium', 'inactive')),
  scheduled_for timestamptz NOT NULL,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'canceled', 'error')),
  result_sent   integer,
  result_failed integer,
  result_total  integer,
  error_message text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  sent_at       timestamptz
);

-- Índice para o cron achar rápido as pendentes que já venceram
CREATE INDEX IF NOT EXISTS scheduled_notifications_due_idx
  ON scheduled_notifications (status, scheduled_for);

-- RLS: apenas service role (as operações passam pelos endpoints admin)
ALTER TABLE scheduled_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role total scheduled_notifications"
  ON scheduled_notifications FOR ALL
  USING (true)
  WITH CHECK (true);
