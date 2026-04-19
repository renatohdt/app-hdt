-- Adiciona política SELECT explícita para service_role na tabela subscriptions.
-- O bypass automático de RLS requer que a chave na Vercel seja de fato a service_role key.
-- Esta política torna a leitura server-side robusta independentemente da configuração de chave.
CREATE POLICY "Service role can read subscriptions"
ON public.subscriptions
FOR SELECT
USING (auth.role() = 'service_role'::text);
