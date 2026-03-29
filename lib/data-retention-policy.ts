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
    suggestedRetention: "Enquanto a conta estiver ativa; remocao imediata pelo fluxo de exclusao da conta.",
    defaultWindowDays: null,
    destinationAfterWindow: "delete",
    automatedByDefault: false,
    notes:
      "A conta ativa continua sendo a base principal de retencao. A estrutura de soft delete e anonimização fica preparada para cenarios operacionais futuros, mas a decisao juridica final ainda precisa ser validada."
  },
  {
    table: "public.user_answers",
    dataType: "Respostas do onboarding e dados de personalizacao, incluindo dados sensiveis.",
    suggestedRetention: "Enquanto a conta estiver ativa; graca de ate 30 dias se o registro for marcado para expurgo interno.",
    defaultWindowDays: 30,
    destinationAfterWindow: "anonymize",
    automatedByDefault: false,
    notes:
      "Nao existe expurgo automatico para contas ativas. A anonimizacao automatica so atua em registros previamente marcados com deleted_at/expires_at."
  },
  {
    table: "public.workouts",
    dataType: "Treinos personalizados e historico de montagem.",
    suggestedRetention: "Enquanto a conta estiver ativa; graca de ate 30 dias se o registro for marcado para expurgo interno.",
    defaultWindowDays: 30,
    destinationAfterWindow: "anonymize",
    automatedByDefault: false,
    notes:
      "Nao ha limpeza automatica de treinos de contas ativas. A rotina anonimiza apenas registros ja marcados para descarte."
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
      "Nao ha expurgo automatico de consentimentos ativos. Campos de expiracao e deleted_at ficam preparados para uma politica juridica posterior."
  },
  {
    table: "public.workout_review_requests",
    dataType: "Pedidos de revisao humana e contestacao do treino automatizado.",
    suggestedRetention: "24 meses para operacao e atendimento.",
    defaultWindowDays: 730,
    destinationAfterWindow: "delete",
    automatedByDefault: true,
    notes:
      "A limpeza automatica atua apenas em solicitacoes finalizadas ou explicitamente marcadas para descarte."
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
