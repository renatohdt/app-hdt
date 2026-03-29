create extension if not exists "pgcrypto";

create table if not exists public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  granted boolean not null,
  version text not null,
  source text,
  granted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_consents add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.user_consents add column if not exists scope text;
alter table public.user_consents add column if not exists granted boolean;
alter table public.user_consents add column if not exists version text;
alter table public.user_consents add column if not exists source text;
alter table public.user_consents add column if not exists granted_at timestamptz;
alter table public.user_consents add column if not exists revoked_at timestamptz;
alter table public.user_consents add column if not exists created_at timestamptz not null default now();
alter table public.user_consents alter column user_id set not null;
alter table public.user_consents alter column scope set not null;
alter table public.user_consents alter column granted set not null;
alter table public.user_consents alter column version set not null;
alter table public.user_consents alter column created_at set default now();

create unique index if not exists user_consents_user_scope_key on public.user_consents(user_id, scope);
create index if not exists user_consents_user_id_idx on public.user_consents(user_id);
create index if not exists user_consents_scope_granted_idx on public.user_consents(scope, granted);

alter table public.user_consents enable row level security;

drop policy if exists "Users can read own consents" on public.user_consents;
drop policy if exists "Users can insert own consents" on public.user_consents;
drop policy if exists "Users can update own consents" on public.user_consents;

create policy "Users can read own consents"
  on public.user_consents
  for select
  using (auth.uid() = user_id);

create policy "Users can insert own consents"
  on public.user_consents
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update own consents"
  on public.user_consents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

update public.workouts
set hash = null
where hash is not null
  and hash !~ '^[a-f0-9]{64}$';

notify pgrst, 'reload schema';
