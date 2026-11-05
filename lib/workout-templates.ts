// MODELOS DE TREINO (método do Renato) — piloto.
//
// Um modelo define as VAGAS de um treino: papel, músculo, tipo, bloco combinado,
// ordem de corte por tempo e técnica. A IA escolhe 1 exercício do catálogo por
// vaga; o app valida, completa o que faltar e monta os blocos.
//
// Piloto: Full body A/B · intermediário · musculação · hipertrofia.
// Perfis sem modelo seguem o gerador atual (plano B), sem mudança.
// Fonte dos modelos: doc "Modelos de treino — formato e exemplos".

import type { TrainingStyle } from "@/lib/types";
import type { SessionBlueprint, WorkoutStrategy } from "@/lib/workout-strategy";

export type TemplateSlotType = "warmup" | "compound" | "isolation" | "isometric" | "core";
export type TemplateTechnique = "drop-set" | "rest-pause";

export type TemplateSlot = {
  /** Posição na sessão (ordem do treino). */
  n: number;
  /** O que o exercício precisa ser, em português (vai para o prompt). */
  role: string;
  /** Músculos primários aceitos na vaga (códigos do catálogo). */
  muscles: string[];
  type: TemplateSlotType;
  /** Id do bloco combinado (B1, B2...). Vazio = exercício isolado. */
  block?: string;
  /** Ordem de saída quando o tempo é menor (1 = primeira a sair). Vazio = nunca sai. */
  cut?: number;
  technique?: TemplateTechnique;
  /**
   * Outros tipos aceitos na vaga, opcionalmente só para alguns músculos. Ex.: posterior
   * aceita stiff (isolador de posterior), mas NÃO isolador de glúteo (regra do homem).
   */
  alsoAccept?: { type: TemplateSlotType; muscles?: string[] }[];
  /** Preferência por máquina (só orienta a IA; não é obrigatório). */
  machine?: boolean;
};

export type WorkoutTemplate = {
  id: string;
  label: string;
  slots: TemplateSlot[];
};

type TemplateGroup = {
  splitType: WorkoutStrategy["splitType"];
  day: string;
  levels: WorkoutStrategy["level"][];
  styles: TrainingStyle[];
  goalStyles: WorkoutStrategy["goalStyle"][];
  templates: WorkoutTemplate[];
};

const W: TemplateSlot = { n: 1, role: "Aquecimento", muscles: [], type: "warmup" };
const POSTERIOR = ["hamstrings", "glutes"];

const FULL_BODY_A: WorkoutTemplate[] = [
  {
    id: "FB-A1",
    label: "Agachamento livre sozinho, peito com posterior",
    slots: [
      W,
      { n: 2, role: "Quadríceps composto principal", muscles: ["quadriceps"], type: "compound" },
      { n: 3, role: "Peito composto", muscles: ["chest"], type: "compound", block: "B1" },
      { n: 4, role: "Posterior isolador", muscles: ["hamstrings"], type: "isolation", block: "B1", cut: 4, machine: true },
      { n: 5, role: "Costas vertical (puxada)", muscles: ["back"], type: "compound" },
      { n: 6, role: "Ombro lateral", muscles: ["shoulders"], type: "isolation", block: "B2", cut: 3 },
      { n: 7, role: "Abdômen", muscles: ["abs"], type: "core", block: "B2", cut: 2 },
      { n: 8, role: "Panturrilha", muscles: ["calves"], type: "isolation", cut: 1 }
    ]
  },
  {
    id: "FB-A2",
    label: "Costas primeiro, leg press, peito com posterior",
    slots: [
      W,
      { n: 2, role: "Costas horizontal (remada)", muscles: ["back"], type: "compound", block: "B1" },
      { n: 3, role: "Quadríceps isolador", muscles: ["quadriceps"], type: "isolation", block: "B1", cut: 4, machine: true },
      { n: 4, role: "Quadríceps composto", muscles: ["quadriceps"], type: "compound", machine: true },
      { n: 5, role: "Peito composto", muscles: ["chest"], type: "compound", block: "B2" },
      { n: 6, role: "Posterior isolador", muscles: ["hamstrings"], type: "isolation", block: "B2", cut: 3, machine: true },
      { n: 7, role: "Ombro lateral", muscles: ["shoulders"], type: "isolation", cut: 2 },
      { n: 8, role: "Panturrilha", muscles: ["calves"], type: "isolation", cut: 1 }
    ]
  },
  {
    id: "FB-A3",
    label: "Unilateral com peito, costas com abdômen isométrico",
    slots: [
      W,
      { n: 2, role: "Quadríceps unilateral", muscles: ["quadriceps"], type: "compound", block: "B1" },
      { n: 3, role: "Peito composto", muscles: ["chest"], type: "compound", block: "B1" },
      { n: 4, role: "Costas vertical (puxada)", muscles: ["back"], type: "compound", block: "B2" },
      { n: 5, role: "Abdômen isométrico", muscles: ["abs"], type: "isometric", block: "B2", cut: 3 },
      { n: 6, role: "Posterior (stiff, terra romeno)", muscles: POSTERIOR, type: "compound", alsoAccept: [{ type: "isolation", muscles: ["hamstrings"] }], cut: 4 },
      { n: 7, role: "Ombro lateral", muscles: ["shoulders"], type: "isolation", cut: 2 },
      { n: 8, role: "Panturrilha", muscles: ["calves"], type: "isolation", cut: 1 }
    ]
  }
];

const FULL_BODY_B: WorkoutTemplate[] = [
  {
    id: "FB-B1",
    label: "Stiff sozinho, ombro com bíceps, tríceps com abdômen",
    slots: [
      W,
      { n: 2, role: "Posterior principal (stiff, terra romeno)", muscles: POSTERIOR, type: "compound", alsoAccept: [{ type: "isolation", muscles: ["hamstrings"] }] },
      { n: 3, role: "Ombro composto", muscles: ["shoulders"], type: "compound", block: "B1" },
      { n: 4, role: "Bíceps", muscles: ["biceps"], type: "isolation", block: "B1", cut: 3 },
      { n: 5, role: "Costas horizontal (remada)", muscles: ["back"], type: "compound" },
      { n: 6, role: "Quadríceps unilateral", muscles: ["quadriceps"], type: "compound", cut: 4 },
      { n: 7, role: "Tríceps", muscles: ["triceps"], type: "isolation", block: "B2", cut: 2 },
      { n: 8, role: "Abdômen", muscles: ["abs"], type: "core", block: "B2", cut: 1 }
    ]
  },
  {
    id: "FB-B2",
    label: "Terra romeno, peito com abdômen, costas com ombro posterior",
    slots: [
      W,
      { n: 2, role: "Posterior principal (stiff, terra romeno)", muscles: POSTERIOR, type: "compound", alsoAccept: [{ type: "isolation", muscles: ["hamstrings"] }] },
      { n: 3, role: "Peito composto", muscles: ["chest"], type: "compound", block: "B1" },
      { n: 4, role: "Abdômen isométrico", muscles: ["abs"], type: "isometric", block: "B1", cut: 4 },
      { n: 5, role: "Costas vertical (puxada)", muscles: ["back"], type: "compound", block: "B2" },
      { n: 6, role: "Ombro posterior", muscles: ["shoulders"], type: "isolation", block: "B2", cut: 3 },
      { n: 7, role: "Quadríceps unilateral", muscles: ["quadriceps"], type: "compound", cut: 2 },
      { n: 8, role: "Panturrilha", muscles: ["calves"], type: "isolation", cut: 1 }
    ]
  },
  {
    id: "FB-B3",
    label: "Costas com quadríceps, ombro com bíceps, tríceps com técnica",
    slots: [
      W,
      { n: 2, role: "Costas vertical (puxada)", muscles: ["back"], type: "compound", block: "B1" },
      { n: 3, role: "Quadríceps isolador", muscles: ["quadriceps"], type: "isolation", block: "B1", cut: 4, machine: true },
      { n: 4, role: "Posterior (stiff, terra romeno)", muscles: POSTERIOR, type: "compound", alsoAccept: [{ type: "isolation", muscles: ["hamstrings"] }] },
      { n: 5, role: "Ombro composto", muscles: ["shoulders"], type: "compound", block: "B2" },
      { n: 6, role: "Bíceps", muscles: ["biceps"], type: "isolation", block: "B2", cut: 3 },
      { n: 7, role: "Tríceps", muscles: ["triceps"], type: "isolation", cut: 2, technique: "drop-set" },
      { n: 8, role: "Panturrilha", muscles: ["calves"], type: "isolation", cut: 1 }
    ]
  }
];

const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    splitType: "full_body_ab",
    day: "A",
    levels: ["intermediate"],
    styles: ["musculacao", "personal"],
    goalStyles: ["hypertrophy"],
    templates: FULL_BODY_A
  },
  {
    splitType: "full_body_ab",
    day: "B",
    levels: ["intermediate"],
    styles: ["musculacao", "personal"],
    goalStyles: ["hypertrophy"],
    templates: FULL_BODY_B
  }
];

/** Modelos disponíveis para um treino do plano (vazio = sem modelo → plano B). */
export function findTemplatesForSession(strategy: WorkoutStrategy, blueprint: SessionBlueprint): WorkoutTemplate[] {
  const style = blueprint.trainingStyle ?? strategy.trainingStyle;
  const group = TEMPLATE_GROUPS.find(
    (entry) =>
      entry.splitType === strategy.splitType &&
      entry.day === blueprint.day &&
      entry.levels.includes(strategy.level) &&
      entry.styles.includes(style) &&
      entry.goalStyles.includes(strategy.goalStyle)
  );
  return group?.templates ?? [];
}

/**
 * Escolhe o modelo de cada treino do plano. `pick` permite fixar a escolha
 * (ex.: "não gostei" → próximo modelo); sem ele, sorteia.
 */
export function selectSessionTemplates(
  strategy: WorkoutStrategy,
  sessions: SessionBlueprint[],
  pick: (options: WorkoutTemplate[], blueprint: SessionBlueprint) => WorkoutTemplate = (options) =>
    options[Math.floor(Math.random() * options.length)]
): Map<string, WorkoutTemplate> {
  const selected = new Map<string, WorkoutTemplate>();
  for (const blueprint of sessions) {
    const options = findTemplatesForSession(strategy, blueprint);
    if (options.length) selected.set(blueprint.day, pick(options, blueprint));
  }
  return selected;
}

export type SlotCandidate = {
  primaryMuscles: string[];
  movementType: string;
  isWarmup: boolean;
};

/** O exercício serve para a vaga? (músculo primário + tipo de movimento) */
export function matchesTemplateSlot(slot: TemplateSlot, candidate: SlotCandidate) {
  if (slot.type === "warmup") return candidate.isWarmup;
  if (candidate.isWarmup || candidate.movementType === "mobility") return false;

  const primary = candidate.primaryMuscles[0] ?? "";
  if (!slot.muscles.includes(primary)) return false;

  if (matchesSlotType(slot.type, candidate)) return true;
  return (slot.alsoAccept ?? []).some(
    (extra) => (!extra.muscles || extra.muscles.includes(primary)) && matchesSlotType(extra.type, candidate)
  );
}

function matchesSlotType(type: TemplateSlotType, candidate: SlotCandidate) {
  switch (type) {
    case "compound":
      // O catálogo marca vários compostos de posterior/glúteo como "functional".
      return candidate.movementType === "compound" || candidate.movementType === "functional";
    case "isolation":
      return candidate.movementType === "isolation";
    case "isometric":
      return candidate.movementType === "isometric";
    case "core":
      return true;
    default:
      return false;
  }
}

const TYPE_LABEL: Record<TemplateSlotType, string> = {
  warmup: "aquecimento (da lista AQUECIMENTOS DISPONIVEIS)",
  compound: "composto",
  isolation: "isolador",
  isometric: "isométrico",
  core: "core"
};

/** Linhas do prompt que descrevem o modelo de um treino. */
export function buildTemplatePromptLines(day: string, template: WorkoutTemplate): string[] {
  return [
    `MODELO DO TREINO ${day} (${template.id}) — 1 exercicio por vaga, NA ORDEM, e devolva o campo "slot" com o numero da vaga:`,
    ...template.slots.map((slot) => {
      const parts = [`${slot.n}. ${slot.role}`];
      if (slot.type !== "warmup") parts.push(`musculo: ${slot.muscles.join(" ou ")}`);
      parts.push([TYPE_LABEL[slot.type], ...(slot.alsoAccept ?? []).map((extra) => TYPE_LABEL[extra.type])].join(" ou "));
      if (slot.machine) parts.push("de preferencia maquina");
      return `- ${parts.join(" · ")}`;
    })
  ];
}
