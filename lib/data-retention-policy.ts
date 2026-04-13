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
    dataType: "Perfil interno mínimo da conta no app.",
    suggestedRetention: "Enquanto a conta estiver ativa; remoção imediata pelo fluxo de exclusão da conta.",
    defaultWindowDays: null,
    destinationAfterWindow: "delete",
    automatedByDefault: false,
    notes:
      "A conta ativa continua sendo a base principal de retenção. A estrutura de soft delete e anonimização fica preparada para cenários operacionais futuros, mas a decisão jurídica final ainda precisa ser validada."
  },
  {
    table: "public.user_answers",
    dataType: "Respostas do onboarding e dados gerais de personalização do treino.",
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
    suggestedRetention: "180 dias por padrão técnico.",
    defaultWindowDays: 180,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Os eventos passam a receber expires_at e podem ser removidos automaticamente pela rotina agendada."
  },
  {
    table: "public.content_recommendations",
    dataType: "Recomendações temporárias de conteúdo.",
    suggestedRetention: "24 horas por padrão técnico.",
    defaultWindowDays: 1,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "A tabela já possui expires_at e agora entra formalmente na rotina de limpeza automática."
  },
  {
    table: "public.user_consents",
    dataType: "Estado atual de consentimentos e evidências mínimas do produto.",
    suggestedRetention: "Enquanto a conta estiver ativa; prazo final depende de decisão jurídica sobre guarda probatória.",
    defaultWindowDays: null,
    destinationAfterWindow: "operational_hold",
    automatedByDefault: false,
    notes:
      "Não há expurgo automático de consentimentos ativos. Campos de expiração e deleted_at ficam preparados para uma política jurídica posterior."
  },
  {
    table: "public.workout_review_requests",
    dataType: "Registros operacionais legados associados a um fluxo descontinuado.",
    suggestedRetention: "24 meses para controle técnico-operacional.",
    defaultWindowDays: 730,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Mantido por compatibilidade de banco e rotina de limpeza. O app atual não expõe esse fluxo ao usuário."
  },
  {
    table: "public.admin_audit_logs",
    dataType: "Trilha de auditoria do painel administrativo.",
    suggestedRetention: "24 meses por padrão técnico-operacional.",
    defaultWindowDays: 730,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "Pode receber retention_hold quando houver investigação, incidente ou necessidade de preservação."
  }
];
