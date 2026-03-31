# Retencao Tecnica de Dados

Versão da base técnica: `2026-03-29-phase-4`

## O que e limpo automaticamente
- `public.content_recommendations`: exclusao de registros expirados apos `expires_at`.
- `public.analytics_events`: exclusao de eventos expirados por padrao tecnico de 180 dias.
- `public.workout_review_requests`: exclusao de solicitacoes finalizadas quando expirarem pela janela operacional configurada.
- `public.admin_audit_logs`: exclusao de trilhas administrativas expiradas, salvo `retention_hold`.

## O que pode ser anonimizado
- `public.user_answers`: respostas do onboarding podem ser anonimizadas quando o registro ja estiver marcado com `deleted_at` e atingir a janela de expurgo.
- `public.workouts`: JSON do treino e `hash` podem ser limpos quando o registro estiver marcado para descarte.
- `public.users`: o nome interno pode ser substituido por valor neutro em fluxos de soft delete futuros.

## O que nao entra em limpeza automatica por padrao
- `public.users`, `public.user_answers` e `public.workouts` de contas ativas.
- `public.user_consents` ativos ou necessarios para evidencia operacional.

## Campos de suporte adicionados
- `deleted_at`: marca descarte logico quando fizer sentido.
- `anonymized_at`: registra quando a anonimizacao ja foi aplicada.
- `expires_at`: define a data técnica de expurgo quando aplicável.
- `retention_hold`: bloqueia expurgo automatizado em caso de incidente, investigacao ou exigencia operacional.

## Execucao agendada
- Rotina SQL: `public.run_retention_cleanup(p_run_at timestamptz, p_dry_run boolean)`.
- Script local ou operacional: `npm run retention:cleanup`.
- Simulacao sem alterar dados: `npm run retention:cleanup:dry`.

## Dependencias operacionais
- A execucao automatica depende de agendamento externo, como cron, scheduler da hospedagem ou job do Supabase.
- A decisao juridica final ainda precisa validar prazos definitivos para consentimentos, dados centrais da conta e eventuais obrigacoes de guarda.

## Compatibilidade
- `DELETE /api/account/delete` continua apagando a conta via Auth com cascata.
- `GET /api/privacy/export` continua exportando os dados do titular e agora exibe a versão da política técnica de retenção.
