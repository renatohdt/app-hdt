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

export type TemplateSlotType = "warmup" | "compound" | "isolation" | "isometric" | "cardio" | "functional" | "core";
export type TemplateTechnique =
  | "drop-set"
  | "rest-pause"
  | "cluster"
  | "tempo_controlado"
  | "parciais"
  | "pre-exaustao"
  | "pos-exaustao";

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
  alsoAccept?: { type?: TemplateSlotType; muscles?: string[] }[];
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

export const FULL_BODY_A: WorkoutTemplate[] = [
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

export const FULL_BODY_B: WorkoutTemplate[] = [
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
  if (slot.type === "warmup") {
    // Aquecimento com músculo definido (ex.: ombro): só serve o aquecimento desse músculo.
    if (!candidate.isWarmup) return false;
    return !slot.muscles.length || slot.muscles.includes(candidate.primaryMuscles[0] ?? "");
  }
  if (candidate.isWarmup || candidate.movementType === "mobility") return false;

  const primary = candidate.primaryMuscles[0] ?? "";
  if (slot.muscles.includes(primary) && matchesSlotType(slot.type, candidate)) return true;
  // "Também aceita": outro tipo do mesmo músculo, ou outro músculo (ex.: bíceps OU glúteo).
  // Sem músculos na alternativa, vale para os músculos da própria vaga.
  return (slot.alsoAccept ?? []).some((extra) => {
    const muscles = extra.muscles?.length ? extra.muscles : slot.muscles;
    return muscles.includes(primary) && matchesSlotType(extra.type ?? slot.type, candidate);
  });
}

/** O tipo de movimento do exercício serve para o tipo da vaga? (usado também na troca) */
export function matchesSlotTypeForMovement(type: string, movementType: string) {
  return matchesSlotType(type as TemplateSlotType, { primaryMuscles: [], movementType, isWarmup: false });
}

/**
 * Tipo que o exercício cumpriu na vaga: o tipo principal, ou o da alternativa ("também aceita")
 * que ele atendeu. Fica salvo no exercício para a troca manter o desenho do modelo.
 */
export function resolveMatchedSlotType(slot: TemplateSlot, candidate: SlotCandidate): TemplateSlotType {
  const primary = candidate.primaryMuscles[0] ?? "";
  if (slot.muscles.includes(primary) && matchesSlotType(slot.type, candidate)) return slot.type;
  const extra = (slot.alsoAccept ?? []).find((item) => {
    const muscles = item.muscles?.length ? item.muscles : slot.muscles;
    return muscles.includes(primary) && matchesSlotType(item.type ?? slot.type, candidate);
  });
  return extra?.type ?? slot.type;
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
    // O catálogo trata cardio como "functional" no perfil do exercício.
    case "cardio":
    case "functional":
      return candidate.movementType === "functional";
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
  cardio: "cardio",
  functional: "funcional",
  core: "qualquer tipo"
};

/** Linhas do prompt que descrevem o modelo de um treino. */
export function buildTemplatePromptLines(day: string, template: WorkoutTemplate): string[] {
  return [
    `MODELO DO TREINO ${day} (${template.id}) — 1 exercicio por vaga, NA ORDEM, e devolva o campo "slot" com o numero da vaga:`,
    ...template.slots.map((slot) => {
      const parts = [`${slot.n}. ${slot.role}`];
      if (slot.muscles.length) parts.push(`musculo: ${slot.muscles.join(" ou ")}`);
      parts.push(TYPE_LABEL[slot.type]);
      for (const extra of slot.alsoAccept ?? []) {
        const muscles = extra.muscles?.length ? extra.muscles.join(" ou ") : slot.muscles.join(" ou ");
        parts.push(`ou ${muscles} ${TYPE_LABEL[extra.type ?? slot.type]}`);
      }
      if (slot.technique) parts.push(`tecnica: ${slot.technique}`);
      if (slot.machine) parts.push("de preferencia maquina");
      return `- ${parts.join(" · ")}`;
    })
  ];
}

export type SlimCatalogExercise = {
  name: string;
  primaryMuscles: string[];
  movementType: string;
  /** Dificuldade 1–5 (só vai no prompt quando a progressão usa). */
  d?: number | null;
};

const MOVEMENT_CODE: Record<string, string> = {
  compound: "C",
  functional: "C",
  isolation: "I",
  isometric: "T"
};

/** Músculos que aparecem em alguma vaga dos modelos (só esses vão para o catálogo). */
export function collectTemplateMuscles(templates: Iterable<WorkoutTemplate>): Set<string> {
  const muscles = new Set<string>();
  for (const template of templates) {
    for (const slot of template.slots) {
      slot.muscles.forEach((muscle) => muscles.add(muscle));
      (slot.alsoAccept ?? []).forEach((extra) => (extra.muscles ?? []).forEach((muscle) => muscles.add(muscle)));
    }
  }
  return muscles;
}

/**
 * Catálogo enxuto para treinos com modelo: só músculos usados nas vagas, uma linha por
 * músculo, sem campos que o app já define (estilo, músculos secundários).
 * Ex.: "chest: Supino Reto (C), Crucifixo (I)".
 */
export function buildSlimCatalogLines(exercises: SlimCatalogExercise[], muscles: Set<string>): string[] {
  const byMuscle = new Map<string, string[]>();
  for (const exercise of exercises) {
    const primary = exercise.primaryMuscles[0] ?? "";
    if (!muscles.has(primary)) continue;
    const code = MOVEMENT_CODE[exercise.movementType] ?? "C";
    const list = byMuscle.get(primary) ?? [];
    list.push(`${exercise.name} (${code}${exercise.d ?? ""})`);
    byMuscle.set(primary, list);
  }
  return [...byMuscle].map(([muscle, names]) => `${muscle}: ${names.join(", ")}`);
}
