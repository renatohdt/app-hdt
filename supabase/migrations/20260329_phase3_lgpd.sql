create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id text not null,
  admin_email text,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_logs add column if not exists admin_id text;
alter table public.admin_audit_logs add column if not exists admin_email text;
alter table public.admin_audit_logs add column if not exists action text;
alter table public.admin_audit_logs add column if not exists target_type text;
alter table public.admin_audit_logs add column if not exists target_id text;
alter table public.admin_audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.admin_audit_logs add column if not exists created_at timestamptz not null default now();
alter table public.admin_audit_logs alter column admin_id set not null;
alter table public.admin_audit_logs alter column action set not null;
alter table public.admin_audit_logs alter column target_type set not null;
alter table public.admin_audit_logs alter column metadata set default '{}'::jsonb;
alter table public.admin_audit_logs alter column created_at set default now();

create index if not exists admin_audit_logs_admin_id_idx on public.admin_audit_logs(admin_id);
create index if not exists admin_audit_logs_action_idx on public.admin_audit_logs(action);
create index if not exists admin_audit_logs_created_at_idx on public.admin_audit_logs(created_at desc);

alter table public.admin_audit_logs enable row level security;

notify pgrst, 'reload schema';
