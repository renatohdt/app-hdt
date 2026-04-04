alter table public.exercises
  add column if not exists muscle_groups text[] not null default '{}';

update public.exercises
set muscle_groups = array_remove(array[nullif(btrim(muscle), '')], null)
where coalesce(array_length(muscle_groups, 1), 0) = 0
  and coalesce(btrim(muscle), '') <> '';

update public.exercises
set metadata = jsonb_set(
  jsonb_set(
    jsonb_set(
      coalesce(metadata, '{}'::jsonb),
      '{muscle}',
      to_jsonb(coalesce(nullif(btrim(muscle), ''), muscle_groups[1], ''))
    ),
    '{muscles}',
    to_jsonb(muscle_groups)
  ),
  '{muscle_groups}',
  to_jsonb(muscle_groups)
)
where coalesce(metadata->'muscle_groups', 'null'::jsonb) <> to_jsonb(muscle_groups)
   or coalesce(metadata->'muscles', 'null'::jsonb) <> to_jsonb(muscle_groups)
   or coalesce(metadata->>'muscle', '') <> coalesce(nullif(btrim(muscle), ''), muscle_groups[1], '');

create index if not exists exercises_muscle_groups_idx
  on public.exercises
  using gin (muscle_groups);
