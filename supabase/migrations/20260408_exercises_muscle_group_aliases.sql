create or replace function public.normalize_exercise_muscle_group(input text)
returns text
language sql
immutable
as $$
  with prepared as (
    select
      nullif(
        trim(
          regexp_replace(
            regexp_replace(
              lower(
                translate(
                  coalesce(input, ''),
                  'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝŸýÿ',
                  'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYYyy'
                )
              ),
              '[_-]+',
              ' ',
              'g'
            ),
            '\s+',
            ' ',
            'g'
          )
        ),
        ''
      ) as normalized,
      nullif(btrim(coalesce(input, '')), '') as original
  )
  select case
    when normalized in ('chest', 'peito', 'peitoral') then 'chest'
    when normalized in ('back', 'costas', 'dorsal', 'dorsais') then 'back'
    when normalized in ('shoulders', 'ombro', 'ombros', 'deltoide', 'deltoides') then 'shoulders'
    when normalized in ('biceps', 'bicep') then 'biceps'
    when normalized in ('triceps', 'tricep') then 'triceps'
    when normalized in ('abs', 'abdomen', 'abdominal', 'abdominais', 'core') then 'abs'
    when normalized in ('lower back', 'lombar', 'lombares', 'lumbar') then 'lower_back'
    when normalized in ('quadriceps') then 'quadriceps'
    when normalized in ('glutes', 'gluteo', 'gluteos') then 'glutes'
    when normalized in ('hamstrings', 'posterior', 'posterior de coxa') then 'hamstrings'
    when normalized in ('calves', 'gemeos', 'panturrilha', 'panturrilhas') then 'calves'
    when normalized in ('forearms', 'antebraco', 'antebracos') then 'forearms'
    when normalized in ('adductors', 'adutor', 'adutores') then 'adductors'
    when normalized in ('abductors', 'abdutor', 'abdutores') then 'abductors'
    when normalized in ('tibial', 'tibiais', 'tibialis') then 'tibialis'
    when normalized in (
      'hip flexor',
      'hip flexors',
      'flexor de quadril',
      'flexores de quadril',
      'flexor do quadril',
      'flexores do quadril',
      'iliopsoas'
    ) then 'hip_flexors'
    else original
  end
  from prepared;
$$;

create or replace function public.normalize_exercise_muscle_group_array(input text[])
returns text[]
language sql
immutable
as $$
  with normalized as (
    select
      public.normalize_exercise_muscle_group(item) as value,
      ord
    from unnest(coalesce(input, '{}'::text[])) with ordinality as item(item, ord)
  ),
  deduped as (
    select value, min(ord) as first_ord
    from normalized
    where value is not null
      and btrim(value) <> ''
    group by value
  )
  select coalesce(array(select value from deduped order by first_ord), '{}'::text[]);
$$;

create or replace function public.set_exercise_name_normalized()
returns trigger
language plpgsql
as $$
declare
  next_metadata jsonb;
  next_muscle_groups text[];
begin
  new.name_normalized = public.normalize_exercise_name(new.name);

  next_muscle_groups = public.normalize_exercise_muscle_group_array(
    case
      when coalesce(array_length(new.muscle_groups, 1), 0) > 0 then new.muscle_groups
      when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'muscle_groups') = 'array' then
        array(select jsonb_array_elements_text(coalesce(new.metadata, '{}'::jsonb)->'muscle_groups'))
      when jsonb_typeof(coalesce(new.metadata, '{}'::jsonb)->'muscles') = 'array' then
        array(select jsonb_array_elements_text(coalesce(new.metadata, '{}'::jsonb)->'muscles'))
      when coalesce(btrim(new.muscle), '') <> '' then array[new.muscle]
      when coalesce(btrim(coalesce(new.metadata, '{}'::jsonb)->>'muscle'), '') <> '' then
        array[coalesce(new.metadata, '{}'::jsonb)->>'muscle']
      else '{}'::text[]
    end
  );

  new.muscle_groups = next_muscle_groups;
  new.muscle = coalesce(
    next_muscle_groups[1],
    public.normalize_exercise_muscle_group(new.muscle),
    public.normalize_exercise_muscle_group(coalesce(new.metadata, '{}'::jsonb)->>'muscle')
  );

  next_metadata = coalesce(new.metadata, '{}'::jsonb);
  next_metadata = jsonb_set(next_metadata, '{muscle}', to_jsonb(coalesce(new.muscle, '')), true);
  next_metadata = jsonb_set(next_metadata, '{muscle_groups}', to_jsonb(new.muscle_groups), true);
  next_metadata = jsonb_set(next_metadata, '{muscles}', to_jsonb(new.muscle_groups), true);
  new.metadata = next_metadata;

  return new;
end;
$$;

drop trigger if exists set_exercises_name_normalized on public.exercises;

create trigger set_exercises_name_normalized
before insert or update of name, muscle, muscle_groups, metadata
on public.exercises
for each row
execute function public.set_exercise_name_normalized();

update public.exercises
set muscle = muscle,
    muscle_groups = muscle_groups,
    metadata = metadata;
