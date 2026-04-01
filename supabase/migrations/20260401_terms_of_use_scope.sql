alter table public.user_consents drop constraint if exists user_consents_scope_check;

alter table public.user_consents
  add constraint user_consents_scope_check
  check (scope in ('health', 'analytics', 'marketing', 'ads', 'ai_training_notice', 'terms_of_use'));
