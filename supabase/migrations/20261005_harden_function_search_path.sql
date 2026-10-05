-- Hardening de funções (out/2026) — avisos "Function Search Path Mutable" do Supabase Advisor.
-- 1) Fixa o search_path das funções (boa prática de segurança; não muda o comportamento).
-- 2) Funções de admin só podem ser chamadas pelo servidor (service_role), não por anon/authenticated.
-- 3) Remove get_retention_metrics: o admin deixou de usar (retenção agora no PostHog).

alter function public.normalize_exercise_name(text) set search_path = public;
alter function public.set_exercise_name_normalized() set search_path = public;
alter function public.set_updated_at() set search_path = public;
alter function public.get_premium_potential_users() set search_path = public;
alter function public.get_feature_usage_counts() set search_path = public;

revoke execute on function public.get_premium_potential_users() from public, anon, authenticated;
revoke execute on function public.get_feature_usage_counts() from public, anon, authenticated;
grant execute on function public.get_premium_potential_users() to service_role;
grant execute on function public.get_feature_usage_counts() to service_role;

drop function if exists public.get_retention_metrics();
