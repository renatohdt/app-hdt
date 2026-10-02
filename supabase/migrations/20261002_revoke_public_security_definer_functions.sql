-- URGENTE (02/out/2026): funções SECURITY DEFINER executáveis por qualquer um.
-- get_all_user_answers() devolvia as respostas do quiz de TODOS os usuários
-- para quem tivesse a chave pública do app (anon), sem login.
-- O painel admin chama essas funções com a service_role, que continua podendo.
-- Funciona nos dois bancos (DEV e produção): pula a função que não existir.
-- Seguro rodar mais de uma vez.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_all_user_answers()',
    'public.get_monthly_funnel_data(timestamptz)',
    'public.rls_auto_enable()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
      if fn <> 'public.rls_auto_enable()' then
        execute format('grant execute on function %s to service_role', fn);
      end if;
      raise notice 'Fechado: %', fn;
    else
      raise notice 'Não existe neste banco (ok, pulando): %', fn;
    end if;
  end loop;
end
$$;
