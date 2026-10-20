// ─────────────────────────────────────────────────────────────────────────────
// Reavaliação de nível (Perfil > Dados de Treino > Rever nível) — Renato, out/2026
//
// O usuário responde 6 perguntas; cada resposta vale pontos (-1, 0 ou +1).
// A soma (de -6 a +6) indica a fase de evolução. O cálculo é SEMPRE feito no
// servidor (app/api/level/reassess): o app manda só as respostas.
//
// Faixas:  -6..-3 Iniciante · -2..0 Pré-Intermediário · +1..+3 Intermediário
//          +4..+5 Pré-Avançado · +6 Avançado
// Trava:   sem treinar há mais de 6 meses → no máximo Pré-Intermediário
//          (o corpo destreina; voltar com calma evita lesão).
// Regras:  vai direto para a fase indicada (sobe ou desce); sem limite de vezes.
// ─────────────────────────────────────────────────────────────────────────────

import { PHASE_LABELS, PHASE_ORDER, type UserPhase } from "@/lib/user-level";

export type LevelQuestionOption = {
  value: string;
  label: string;
  points: -1 | 0 | 1;
};

export type LevelQuestion = {
  id: string;
  title: string;
  description?: string;
  options: LevelQuestionOption[];
};

export const LEVEL_QUESTIONS: LevelQuestion[] = [
  {
    id: "coached",
    title: "Você já treinou com acompanhamento profissional?",
    description: "Personal trainer, treinador ou professor que montava e acompanhava seu treino.",
    options: [
      { value: "yes", label: "Sim", points: 1 },
      { value: "no", label: "Não", points: -1 }
    ]
  },
  {
    id: "trained_one_year",
    title: "Você já treinou por mais de 1 ano, alguma vez?",
    options: [
      { value: "yes", label: "Sim", points: 1 },
      { value: "no", label: "Não", points: -1 }
    ]
  },
  {
    id: "other_sports",
    title: "Você pratica outros esportes ou atividades físicas?",
    description: "Corrida, futebol, lutas, dança, natação, ciclismo...",
    options: [
      { value: "yes", label: "Sim", points: 1 },
      { value: "no", label: "Não", points: -1 }
    ]
  },
  {
    id: "sedentary",
    title: "Você está sem treinar há mais de 6 meses?",
    options: [
      { value: "yes", label: "Sim", points: -1 },
      { value: "no", label: "Não", points: 1 }
    ]
  },
  {
    id: "technique",
    title: "Você executa bem, sem ajuda, exercícios como agachamento, flexão e remada?",
    options: [
      { value: "no", label: "Não, ainda tenho dúvidas", points: -1 },
      { value: "some", label: "Alguns sim, outros não", points: 0 },
      { value: "yes", label: "Sim, todos", points: 1 }
    ]
  },
  {
    id: "self_level",
    title: "Como você se considera nos treinos?",
    options: [
      { value: "beginner", label: "Iniciante", points: -1 },
      { value: "intermediate", label: "Intermediário", points: 0 },
      { value: "advanced", label: "Avançado", points: 1 }
    ]
  }
];

/** Fase máxima para quem está há mais de 6 meses sem treinar. */
export const SEDENTARY_MAX_PHASE: UserPhase = "pre_intermediario";

/** Converte a pontuação (-6..+6) na fase indicada. */
export function scoreToPhase(score: number): UserPhase {
  if (score <= -3) return "iniciante";
  if (score <= 0) return "pre_intermediario";
  if (score <= 3) return "intermediario";
  if (score <= 5) return "pre_avancado";
  return "avancado";
}

export type LevelAssessmentResult = {
  answers: Record<string, string>;
  score: number;
  phase: UserPhase;
  phaseLabel: string;
  /** true quando a trava de sedentário baixou a fase indicada pelos pontos. */
  capped: boolean;
};

/**
 * Valida as respostas e calcula a fase indicada.
 * Retorna null se faltar resposta ou vier valor desconhecido.
 */
export function evaluateLevelAnswers(raw: unknown): LevelAssessmentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const input = raw as Record<string, unknown>;

  const answers: Record<string, string> = {};
  let score = 0;
  for (const question of LEVEL_QUESTIONS) {
    const value = input[question.id];
    const option = question.options.find((item) => item.value === value);
    if (!option) return null;
    answers[question.id] = option.value;
    score += option.points;
  }

  let phase = scoreToPhase(score);
  let capped = false;
  if (answers.sedentary === "yes" && PHASE_ORDER.indexOf(phase) > PHASE_ORDER.indexOf(SEDENTARY_MAX_PHASE)) {
    phase = SEDENTARY_MAX_PHASE;
    capped = true;
  }

  return { answers, score, phase, phaseLabel: PHASE_LABELS[phase], capped };
}
