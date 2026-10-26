import { QuizAnswers } from "@/lib/types";

export const quizSteps = [
  {
    key: "goal",
    title: "Qual é o seu principal objetivo com o treino?",
    type: "choice",
    options: [
      { label: "Emagrecer", value: "lose_weight" },
      { label: "Ganhar massa muscular", value: "gain_muscle" },
      { label: "Definição", value: "body_recomposition" },
      { label: "Melhorar o condicionamento", value: "improve_conditioning" }
    ]
  },
  {
    // Resposta detalhada fica em "trainingHistory". Cada opção também grava o
    // nível ("experience") que o resto do app já usa — assim nada mais muda.
    key: "trainingHistory",
    title: "Você já treinou ou está treinando?",
    info: "Sua resposta define seu nível inicial e a dificuldade dos exercícios. Depois você pode rever seu nível em Perfil > Dados de Treino.",
    type: "choice",
    options: [
      { label: "Nunca treinei", value: "never", experience: "no_training" },
      { label: "Já treinei alguns meses e parei", value: "stopped_short", experience: "lt_6_months" },
      { label: "Já treinei bastante, mas estou uns meses parado", value: "stopped_long", experience: "6_to_12_months" },
      { label: "Estou treinando, mas faz pouco tempo", value: "training_recent", experience: "lt_6_months" },
      { label: "Estou treinando há anos", value: "training_years", experience: "gt_1_year" }
    ]
  },
  {
    key: "gender",
    title: "Gênero",
    type: "choice",
    options: [
      { label: "Masculino", value: "male" },
      { label: "Feminino", value: "female" }
    ]
  },
  {
    key: "physical",
    title: "Seus dados físicos",
    description: "Com esses dados eu calibro a intensidade e o volume do seu treino.",
    type: "physical"
  },
  {
    key: "wrist",
    title: "Com base na imagem, como os dedos se encontram no seu punho?",
    description: "Envolva o punho com o polegar e o dedo médio.",
    info: "Esse teste mostra sua estrutura óssea. Com ela eu ajusto o volume e a intensidade do treino para o seu corpo.",
    type: "choice",
    image: "/images/punho.webp",
    options: [
      { label: "Os dedos não encostam", value: "dont_touch" },
      { label: "Os dedos apenas encostam", value: "just_touch" },
      { label: "Os dedos se sobrepõem", value: "overlap" }
    ]
  },
  {
    key: "location",
    title: "Onde você vai treinar?",
    description: "Eu escolho os exercícios de acordo com o local. No Premium você pode ter treino em casa e no condomínio.",
    type: "choice",
    options: [
      { label: "Em casa", value: "home" },
      { label: "Na academia do condomínio", value: "condo_gym" }
    ]
  },
  {
    key: "equipment",
    title: "Quais desses materiais você tem em casa?",
    description: "Você pode marcar mais de uma opção.",
    type: "multi",
    options: [
      {
        label: "Halteres",
        value: "halteres",
        icon: "/icon-halteres.webp"
      },
      {
        label: "Elásticos",
        value: "elasticos",
        icon: "/icon-elasticos.webp"
      },
      {
        label: "Fitball",
        value: "fitball",
        icon: "/icon-fitball.webp"
      },
      {
        label: "Fita Suspensa",
        value: "fita_suspensa",
        icon: "/icon-fita-suspensa.webp"
      },
      {
        label: "Caneleira",
        value: "caneleira",
        icon: "/icon-caneleira.webp"
      },
      {
        label: "Kettlebell",
        value: "kettlebell",
        icon: "/icon-kettlebell.webp"
      },
      {
        label: "Rolo Abdominal",
        value: "rolo_abdominal",
        icon: "/icon-abs-carrinho.webp"
      },
      {
        label: "Barra Fixa",
        value: "barra_fixa",
        icon: "/icon-barra-fixa.webp"
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
    description: "Seja realista: treinar 3 vezes e manter vale mais do que planejar 6 e parar.",
    type: "chips",
    values: [1, 2, 3, 4, 5, 6, 7],
    chipLabel: (value: number) => `${value}`,
    formatValue: (value: number) => `${value} ${value === 1 ? "dia" : "dias"} por semana`
  },
  {
    key: "time",
    title: "Quanto tempo você tem para cada treino?",
    description: "Eu ajusto a quantidade de exercícios ao tempo que você tem.",
    type: "chips",
    values: [15, 30, 45, 60, 75, 90],
    chipLabel: (value: number) => `${value} min`,
    formatValue: (value: number) => `${value} min por treino`
  },
  {
    key: "focusRegion",
    title: "Qual região você quer intensificar nos treinos?",
    description: "Vou priorizar exercícios e volume nessa área.",
    type: "choice",
    options: [
      { label: "Peito", value: "chest" },
      { label: "Dorsais", value: "back" },
      { label: "Pernas", value: "legs" },
      { label: "Pernas e Glúteo", value: "legs_glutes" },
      { label: "Braços", value: "arms" },
      { label: "Todos / Equilibrado", value: "balanced" }
    ]
  },
  {
    key: "trainingStyle",
    title: "Qual estilo de treino você prefere?",
    description: "Toque no i para conhecer cada método. Em \"Personal Escolhe\", eu defino o melhor estilo com base nas suas respostas.",
    type: "choice",
    options: [
      {
        label: "Musculação",
        value: "musculacao",
        info: "Exercícios com carga e séries definidas. Ideal para ganhar força e massa muscular."
      },
      {
        label: "Funcional",
        value: "funcional",
        info: "Movimentos que trabalham vários músculos juntos. Melhora força, equilíbrio e mobilidade."
      },
      {
        label: "HIIT",
        value: "hiit",
        info: "Estímulos curtos e intensos com pausas rápidas. Ótimo para gastar calorias e melhorar o fôlego."
      },
      {
        label: "Calistenia",
        value: "calistenia",
        info: "Treino com o peso do próprio corpo. Desenvolve força, controle e resistência."
      },
      {
        label: "Personal Escolhe",
        value: "personal",
        info: "Eu analiso suas respostas e escolho o método que mais combina com seu objetivo e nível."
      }
    ]
  },
  {
    key: "account",
    title: "Crie sua conta para receber seu treino",
    description: "Assim eu salvo seu plano e você acompanha sua evolução.",
    type: "account"
  }
] as const;

export const initialAnswers: Partial<QuizAnswers> = {
  location: "home",
  equipment: [],
  age: 25,
  weight: 70,
  height: 170,
  days: 3,
  time: 45,
  trainingStyle: "personal"
};
