alter table public.analytics_events
  alter column user_id drop not null;

alter table public.analytics_events
  add column if not exists visitor_id text;

alter table public.analytics_events
  drop constraint if exists analytics_events_actor_check;

alter table public.analytics_events
  add constraint analytics_events_actor_check
  check (
    user_id is not null
    or (visitor_id is not null and btrim(visitor_id) <> '')
  );

create index if not exists analytics_events_visitor_created_at_idx
  on public.analytics_events(visitor_id, created_at desc)
  where visitor_id is not null;

create index if not exists analytics_events_visitor_event_created_at_idx
  on public.analytics_events(visitor_id, event_name, created_at desc)
  where visitor_id is not null;
