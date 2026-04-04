import { QuizAnswers } from "@/lib/types";

export const quizSteps = [
  {
    key: "goal",
    title: "Qual é o seu principal objetivo com o treino?",
    description: "Usamos isso para definir a linha geral da sua sugestão.",
    type: "choice",
    options: [
      { label: "Emagrecer", value: "lose_weight" },
      { label: "Ganhar massa muscular", value: "gain_muscle" },
      { label: "Definição", value: "body_recomposition" },
      { label: "Melhorar o condicionamento", value: "improve_conditioning" }
    ]
  },
  {
    key: "experience",
    title: "Há quanto tempo você treina?",
    type: "choice",
    options: [
      { label: "Ainda não treino", value: "no_training" },
      { label: "Menos de 6 meses", value: "lt_6_months" },
      { label: "De 6 meses a 1 ano", value: "6_to_12_months" },
      { label: "Mais de 1 ano", value: "gt_1_year" }
    ]
  },
  {
    key: "gender",
    title: "Gênero",
    description: "Usamos isso para ajustar a comunicação e a distribuição inicial do plano.",
    type: "choice",
    options: [
      { label: "Masculino", value: "male" },
      { label: "Feminino", value: "female" }
    ]
  },
  {
    key: "physical",
    title: "Seus dados físicos",
    description: "Essas informações ajudam a montar uma sugestão mais coerente com seu perfil.",
    type: "physical"
  },
  {
    key: "profession",
    title: "Qual é a sua profissão?",
    type: "text",
    placeholder: "Ex.: trabalho sentado, professor, etc."
  },
  {
    key: "situation",
    title: "Qual situação mais combina com você?",
    type: "choice",
    options: [
      { label: "Eu começo, mas não consigo manter consistência", value: "cant_stay_consistent" },
      { label: "Eu treino, mas não vejo resultados", value: "no_results" },
      { label: "Não sei se estou treinando corretamente", value: "dont_know_correctly" },
      { label: "Sinto que poderia ter resultados melhores", value: "could_get_better" }
    ]
  },
  {
    key: "mindMuscle",
    title: "Você sente o músculo trabalhando durante os exercícios?",
    type: "choice",
    options: [
      { label: "Sim, claramente", value: "clear" },
      { label: "Às vezes", value: "sometimes" },
      { label: "Raramente", value: "rarely" },
      { label: "Nunca", value: "never" }
    ]
  },
  {
    key: "wrist",
    title: "Com base na imagem, como os dedos se encontram no seu punho?",
    description: "Envolva o punho com o polegar e o dedo médio.",
    type: "choice",
    image: "https://horadotreino.com.br/wp-content/uploads/2026/03/treino-em-casa-gratis2.webp",
    options: [
      { label: "Os dedos não encostam", value: "dont_touch" },
      { label: "Os dedos apenas encostam", value: "just_touch" },
      { label: "Os dedos se sobrepõem", value: "overlap" }
    ]
  },
  {
    key: "equipment",
    title: "Quais desses materiais você possui na sua casa?",
    description: "Você pode marcar mais de uma opção.",
    type: "multi",
    options: [
      {
        label: "Halteres",
        value: "halteres",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-halteres.webp"
      },
      {
        label: "Elásticos",
        value: "elasticos",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-elasticos.webp"
      },
      {
        label: "Fitball",
        value: "fitball",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-fitball.webp"
      },
      {
        label: "Fita Suspensa",
        value: "fita_suspensa",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-fita-suspensa.webp"
      },
      {
        label: "Caneleira",
        value: "caneleira",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-caneleira.webp"
      },
      {
        label: "Kettlebell",
        value: "kettlebell",
        icon: "https://horadotreino.com.br/wp-content/uploads/2026/03/icon-kettlebell.webp"
      },
      {
        label: "Nenhum",
        value: "nenhum",
        icon: null
      }
    ]
  },
  {
    key: "days",
    title: "Quantos dias por semana você consegue treinar?",
    type: "slider",
    min: 1,
    max: 7,
    step: 1,
    formatValue: (value: number) => `${value} ${value === 1 ? "dia" : "dias"} por semana`
  },
  {
    key: "time",
    title: "Quanto tempo você tem para treinar?",
    type: "slider",
    min: 15,
    max: 90,
    step: 15,
    formatValue: (value: number) => `${value} min`
  },
  {
    key: "structuredPlan",
    title: "Você já seguiu um plano de treino estruturado?",
    type: "choice",
    options: [
      { label: "Sim, com um personal trainer", value: "coach" },
      { label: "Sim, por conta própria", value: "self" },
      { label: "Não", value: "no" }
    ]
  },
  {
    key: "account",
    title: "Crie sua conta para ver sua sugestão de treino",
    description: "Preencha seus dados para salvar o acesso e ver sua sugestão completa agora mesmo.",
    type: "account"
  }
] as const;

export const initialAnswers: Partial<QuizAnswers> = {
  location: "home",
  equipment: [],
  age: 25,
  weight: 70,
  height: 170,
  profession: "",
  days: 3,
  time: 45
};
