export const DATA_RETENTION_POLICY_VERSION = "2026-03-29-phase-4";

export type RetentionDestination = "delete" | "anonymize" | "operational_hold";

export type DataRetentionPolicyEntry = {
  table: string;
  dataType: string;
  suggestedRetention: string;
  defaultWindowDays: number | null;
  destinationAfterWindow: RetentionDestination;
  automatedByDefault: boolean;
  notes: string;
};

export const DATA_RETENTION_POLICY: DataRetentionPolicyEntry[] = [
  {
    table: "public.users",
    dataType: "Perfil interno minimo da conta no app.",
    suggestedRetention: "Enquanto a conta estiver ativa; remoção imediata pelo fluxo de exclusão da conta.",
    defaultWindowDays: null,
    destinationAfterWindow: "delete",
    automatedByDefault: false,
    notes:
      "A conta ativa continua sendo a base principal de retencao. A estrutura de soft delete e anonimização fica preparada para cenarios operacionais futuros, mas a decisao juridica final ainda precisa ser validada."
  },
  {
    table: "public.user_answers",
    dataType: "Respostas do onboarding e dados gerais de personalizacao do treino.",
    suggestedRetention: "Enquanto a conta estiver ativa; graça de até 30 dias se o registro for marcado para expurgo interno.",
    defaultWindowDays: 30,
    destinationAfterWindow: "anonymize",
    automatedByDefault: false,
    notes:
      "Não existe expurgo automático para contas ativas. A anonimização automática só atua em registros previamente marcados com deleted_at/expires_at."
  },
  {
    table: "public.workouts",
    dataType: "Sugestões de treino e histórico de montagem.",
    suggestedRetention: "Enquanto a conta estiver ativa; graça de até 30 dias se o registro for marcado para expurgo interno.",
    defaultWindowDays: 30,
    destinationAfterWindow: "anonymize",
    automatedByDefault: false,
    notes:
      "Não há limpeza automática de treinos de contas ativas. A rotina anonimiza apenas registros já marcados para descarte."
  },
  {
    table: "public.workout_session_logs",
    dataType: "Marcações de sessões concluídas e base de histórico de execução do treino.",
    suggestedRetention: "Enquanto a conta estiver ativa; graça de até 30 dias se o registro for marcado para expurgo interno.",
    defaultWindowDays: 30,
    destinationAfterWindow: "delete",
    automatedByDefault: false,
    notes:
      "Os registros sustentam o contador de sessões e o futuro histórico do treino. Nesta fase não existe limpeza automática para contas ativas."
  },
  {
    table: "public.analytics_events",
    dataType: "Eventos comportamentais permitidos por consentimento.",
    suggestedRetention: "180 dias por padrao tecnico.",
    defaultWindowDays: 180,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Os eventos passam a receber expires_at e podem ser removidos automaticamente pela rotina agendada."
  },
  {
    table: "public.content_recommendations",
    dataType: "Recomendacoes temporarias de conteudo.",
    suggestedRetention: "24 horas por padrao tecnico.",
    defaultWindowDays: 1,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "A tabela ja possui expires_at e agora entra formalmente na rotina de limpeza automatica."
  },
  {
    table: "public.user_consents",
    dataType: "Estado atual de consentimentos e evidencias minimas do produto.",
    suggestedRetention: "Enquanto a conta estiver ativa; prazo final depende de decisao juridica sobre guarda probatoria.",
    defaultWindowDays: null,
    destinationAfterWindow: "operational_hold",
    automatedByDefault: false,
    notes:
      "Não há expurgo automático de consentimentos ativos. Campos de expiração e deleted_at ficam preparados para uma política jurídica posterior."
  },
  {
    table: "public.workout_review_requests",
    dataType: "Registros operacionais legados associados a um fluxo descontinuado.",
    suggestedRetention: "24 meses para controle tecnico-operacional.",
    defaultWindowDays: 730,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Mantido por compatibilidade de banco e rotina de limpeza. O app atual não expõe esse fluxo ao usuário."
  },
  {
    table: "public.admin_audit_logs",
    dataType: "Trilha de auditoria do painel administrativo.",
    suggestedRetention: "24 meses por padrao tecnico-operacional.",
    defaultWindowDays: 730,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Pode receber retention_hold quando houver investigacao, incidente ou necessidade de preservacao."
  }
];
