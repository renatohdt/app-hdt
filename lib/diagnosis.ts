import { DiagnosisResult, QuizAnswers, UserProfile } from "@/lib/types";

const profileContent: Record<UserProfile, DiagnosisResult> = {
  beginner_lost: {
    profile: "beginner_lost",
    title: "Iniciante Perdido",
    message: "Você não evolui porque seu treino ainda não tem estrutura, clareza de execução e boa percepção muscular.",
    trainingShift: "Vamos te entregar um plano simples, com exercícios claros, rotina semanal estável e foco maior em execução."
  },
  false_intermediate: {
    profile: "false_intermediate",
    title: "Falso Intermediario",
    message: "Você treina, mas sua carga não progride o suficiente para gerar adaptação e resultados visíveis.",
    trainingShift: "Seu novo plano prioriza progressão, exercícios base repetíveis e melhor controle de volume."
  },
  inconsistent: {
    profile: "inconsistent",
    title: "Inconsistente",
    message: "Seu maior problema é a falta de consistência, não a variedade de exercícios. Sem regularidade, nenhum treino funciona bem.",
    trainingShift: "Vamos reduzir a fricção com uma divisão mais simples, sessões curtas e um plano mais fácil de manter."
  },
  stagnated: {
    profile: "stagnated",
    title: "Estagnado",
    message: "Você já treina com consistência, mas sua estrutura atual não gera mais estímulo suficiente para continuar evoluindo.",
    trainingShift: "Vamos ajustar escolha de exercícios, metas de progressão e ênfase semanal para voltar a desafiar seu corpo."
  }
};

export function diagnoseUser(answers: QuizAnswers): DiagnosisResult {
  if (answers.experience === "no_training") {
    return profileContent.beginner_lost;
  }

  if (answers.experience === "lt_6_months") {
    return profileContent.beginner_lost;
  }

  if (answers.experience === "6_to_12_months") {
    return profileContent.false_intermediate;
  }

  // gt_1_year
  return profileContent.stagnated;
}
