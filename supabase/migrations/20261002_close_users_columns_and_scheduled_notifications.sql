-- URGENTE (02/out/2026) — duas brechas encontradas na varredura de segurança.
-- Funciona nos dois bancos (DEV e produção). Seguro rodar mais de uma vez.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) scheduled_notifications: a política "Service role total" valia para
--    QUALQUER papel (inclusive anônimo). Qualquer pessoa podia agendar uma
--    notificação com título/texto/link próprios para TODOS os usuários, e o cron
--    enviaria. O painel admin e o cron usam a service_role (ignora RLS).
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "Service role total scheduled_notifications" on public.scheduled_notifications;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) users: o usuário logado podia alterar QUALQUER coluna da própria linha
--    (ex.: referral_premium_until, apple_premium_expires_at → Premium grátis;
--    billing_cpf; deleted_at; retention_hold). Agora só as colunas que o app
--    realmente grava com o login do usuário:
--      - INSERT: id, name (cadastro no quiz / programa)
--      - UPDATE: name (perfil) + colunas de nível/XP (gamificação)
--    Premium, cobrança, LGPD e role ficam só para o servidor (service_role).
-- ─────────────────────────────────────────────────────────────────────────────
revoke insert, update on public.users from anon, authenticated;

do $$
declare
  col text;
  insert_cols text[] := array['id', 'name'];
  update_cols text[] := array[
    'name',
    'xp_points', 'current_phase', 'phase_started_at', 'last_activity_at',
    'last_perfect_week_at', 'last_monthly_xp_at', 'last_streak_xp_at',
    'last_decay_checked_at'
  ];
begin
  foreach col in array insert_cols loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = col) then
      execute format('grant insert (%I) on public.users to authenticated', col);
    end if;
  end loop;

  foreach col in array update_cols loop
    if exists (select 1 from information_schema.columns
               where table_schema = 'public' and table_name = 'users' and column_name = col) then
      execute format('grant update (%I) on public.users to authenticated', col);
    end if;
  end loop;
end
$$;
