-- Promove um usuário existente do Supabase Auth para admin.
-- Troque o e-mail abaixo pelo e-mail real do administrador.

insert into public.users (id, name, role)
select
  auth_user.id,
  coalesce(
    nullif(auth_user.raw_user_meta_data->>'name', ''),
    split_part(auth_user.email, '@', 1),
    'Admin'
  ),
  'admin'
from auth.users as auth_user
where lower(auth_user.email) = lower('renato@horadotreino.com.br')
on conflict (id) do update
set
  name = excluded.name,
  role = 'admin';
