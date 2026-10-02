-- Auditoria de advisors (02/out/2026)
-- Rodar PRIMEIRO no projeto DEV, conferir, depois na PRODUÇÃO.
-- É seguro rodar mais de uma vez (usa "if exists" / "if not exists").

-- 1) SEGURANÇA: políticas "acesso total" estavam abertas para QUALQUER papel
--    (inclusive anônimo, com a chave pública do app). O servidor usa a
--    service_role, que já ignora RLS — essas políticas não são necessárias.
drop policy if exists "Service role acesso total aos tokens nativos" on public.native_push_tokens;
drop policy if exists "Service role acesso total" on public.push_subscriptions;

-- 2) subscriptions: políticas de service_role redundantes (service_role ignora RLS)
drop policy if exists "Service role can read subscriptions" on public.subscriptions;
drop policy if exists "Service role can insert subscriptions" on public.subscriptions;
drop policy if exists "Service role can update subscriptions" on public.subscriptions;
drop policy if exists "Service role can delete subscriptions" on public.subscriptions;

-- 3) Políticas do próprio usuário: (select auth.uid()) avalia 1x por consulta
drop policy if exists "users_manage_own_measurements" on public.body_measurements;
create policy "users_manage_own_measurements" on public.body_measurements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Usuário lê próprios tokens nativos" on public.native_push_tokens;
create policy "Usuário lê próprios tokens nativos" on public.native_push_tokens
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Usuário insere próprio token nativo" on public.native_push_tokens;
create policy "Usuário insere próprio token nativo" on public.native_push_tokens
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Usuário deleta próprio token nativo" on public.native_push_tokens;
create policy "Usuário deleta próprio token nativo" on public.native_push_tokens
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Usuário lê próprias subscriptions" on public.push_subscriptions;
create policy "Usuário lê próprias subscriptions" on public.push_subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "Usuário insere própria subscription" on public.push_subscriptions;
create policy "Usuário insere própria subscription" on public.push_subscriptions
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "Usuário deleta própria subscription" on public.push_subscriptions;
create policy "Usuário deleta própria subscription" on public.push_subscriptions
  for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "entitlements: dono le o seu" on public.program_entitlements;
create policy "entitlements: dono le o seu" on public.program_entitlements
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can read own subscription" on public.subscriptions;
create policy "Users can read own subscription" on public.subscriptions
  for select to authenticated using ((select auth.uid()) = user_id);

-- 4) Índice da chave estrangeira program_entitlements.program_id
create index if not exists program_entitlements_program_id_idx
  on public.program_entitlements (program_id);
