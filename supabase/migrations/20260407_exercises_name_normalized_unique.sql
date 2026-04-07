create or replace function public.normalize_exercise_name(input text)
returns text
language sql
immutable
as $$
  select trim(
    regexp_replace(
      lower(
        translate(
          coalesce(input, ''),
          'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝŸýÿ',
          'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYYyy'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

create or replace function public.set_exercise_name_normalized()
returns trigger
language plpgsql
as $$
begin
  new.name_normalized = public.normalize_exercise_name(new.name);
  return new;
end;
$$;

alter table public.exercises
  add column if not exists name_normalized text;

update public.exercises
set name_normalized = public.normalize_exercise_name(name)
where coalesce(name_normalized, '') <> public.normalize_exercise_name(name);

drop trigger if exists set_exercises_name_normalized on public.exercises;

create trigger set_exercises_name_normalized
before insert or update of name
on public.exercises
for each row
execute function public.set_exercise_name_normalized();

alter table public.exercises
  alter column name_normalized set not null;

do $$
declare
  duplicate_names text;
begin
  select string_agg(format('%s (%s)', normalized_name, total), '; ' order by normalized_name)
    into duplicate_names
  from (
    select name_normalized as normalized_name, count(*) as total
    from public.exercises
    where coalesce(name_normalized, '') <> ''
    group by name_normalized
    having count(*) > 1
  ) duplicates;

  if duplicate_names is not null then
    raise exception 'Não foi possível criar o índice único de exercícios. Resolva os duplicados antes: %', duplicate_names;
  end if;
end;
$$;

create unique index if not exists exercises_name_normalized_key
  on public.exercises (name_normalized)
  where coalesce(name_normalized, '') <> '';
