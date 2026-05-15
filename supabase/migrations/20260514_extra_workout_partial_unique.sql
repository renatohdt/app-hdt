-- Substitui o índice único global em workouts(user_id) por um índice
-- único parcial que só se aplica a treinos do tipo 'standard'.
-- Isso permite que usuários Premium tenham um treino extra (type = 'extra')
-- em paralelo ao treino regular, sem violar a unicidade.

-- Remove o índice único antigo (1 treino por usuário, sem distinção de tipo)
drop index if exists public.workouts_user_id_key;

-- Cria índice único parcial: apenas 1 treino 'standard' ativo por usuário
-- (treinos 'extra' ficam fora desta constraint e são controlados pela aplicação)
create unique index if not exists workouts_user_standard_unique
  on public.workouts(user_id)
  where type = 'standard';
