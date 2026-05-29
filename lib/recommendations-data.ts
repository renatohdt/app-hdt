/**
 * ─── RECOMENDAÇÕES PERSONALIZADAS ────────────────────────────────────────────
 *
 * Como funciona:
 * Cada card tem filtros opcionais. Se o campo estiver vazio ([]), vale para todos.
 * O app seleciona automaticamente os cards mais relevantes para cada usuário.
 *
 * Campos de filtro:
 *  - goals:      para quais objetivos mostrar (vazio = todos)
 *  - levels:     para quais níveis mostrar (vazio = todos)
 *  - equipment:  mostrar SE o usuário TEM esse equipamento (para dicas de uso)
 *  - missingEquipment: mostrar SE o usuário NÃO TEM (para recomendação de compra)
 *
 * Valores possíveis:
 *  goals:     "lose_weight" | "gain_muscle" | "body_recomposition" | "improve_conditioning"
 *  levels:    "no_training" | "lt_6_months" | "6_to_12_months" | "gt_1_year"
 *  equipment: "halteres" | "elasticos" | "fitball" | "fita_suspensa" | "caneleira"
 *             "kettlebell" | "rolo_abdominal" | "nenhum"
 */

// ─── TIPOS ───────────────────────────────────────────────────────────────────

import type { Goal, Experience, HomeEquipment } from "@/lib/types";

export type RecommendationCard = {
  id: string;
  title: string;
  body: string;
  /** Ícone emoji opcional exibido no card */
  emoji?: string;
  /** Link externo (afiliado, artigo, produto) */
  link?: {
    label: string;
    url: string;
  };
  /** Filtros — array vazio significa "mostrar para todos" */
  goals: Goal[];
  levels: Experience[];
  /** Mostrar se o usuário JÁ TEM este equipamento */
  equipment: HomeEquipment[];
  /** Mostrar se o usuário NÃO TEM este equipamento (usado na aba de materiais) */
  missingEquipment: HomeEquipment[];
};

export type RecommendationsData = {
  training: RecommendationCard[];
  nutrition: RecommendationCard[];
  equipment: RecommendationCard[];
};

// ─── ABA 1: TREINO ───────────────────────────────────────────────────────────

const training: RecommendationCard[] = [
  // ── Iniciantes (no_training / lt_6_months) ──────────────────────────────
  {
    id: "training_beginner_consistency",
    emoji: "📅",
    title: "Consistência vence intensidade",
    body: "No início, o mais importante é criar o hábito. Crie uma meta, registre seus treinos, diminua o tempo do treino se achar necessário, é melhor fazer algo do que não fazer nada.",
    goals: [],
    levels: ["no_training", "lt_6_months"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_beginner_form",
    emoji: "🎯",
    title: "Técnica antes de carga",
    body: "Antes de aumentar peso ou repetições, domine a execução correta de cada exercício. A técnica protege suas articulações, caso sinta muita dificuldade substitua o exercício.",
    goals: [],
    levels: ["no_training", "lt_6_months"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_beginner_rest",
    emoji: "😴",
    title: "O músculo cresce no descanso",
    body: "Tão importante quanto treinar é descansar. Respeite os dias de folga, é neles que o seu corpo se recupera e evolui. Dormir 7-8h por noite acelera seus resultados.",
    goals: [],
    levels: ["no_training", "lt_6_months"],
    equipment: [],
    missingEquipment: [],
  },

  // ── Intermediário (6_to_12_months) ──────────────────────────────────────
  {
    id: "training_intermediate_progression",
    emoji: "📈",
    title: "Sobrecarga progressiva é a chave",
    body: "Para continuar evoluindo, você precisa desafiar o músculo progressivamente. Aumente o peso quando puder, faça exercícios mais avançados, crie progressão no seu treino.",
    goals: [],
    levels: ["6_to_12_months"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_intermediate_mind_muscle",
    emoji: "🧠",
    title: "Conexão mente-músculo",
    body: "Concentre-se no músculo que está sendo trabalhado em cada exercício. Estudos mostram que focar na contração aumenta a ativação muscular em até 20%.",
    goals: ["gain_muscle", "body_recomposition"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: [],
  },

  // ── Avançado (gt_1_year) ────────────────────────────────────────────────
  {
    id: "training_advanced_periodization",
    emoji: "🔄",
    title: "Evolua seus exercícios!",
    body: "Você deve se desafiar mais se quiser mais resultado, hora de exercícios complexos, intensidade alta, para não entrar em platô.",
    goals: [],
    levels: ["gt_1_year"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_advanced_deload",
    emoji: "⚡",
    title: "Semana de deload: não é fraqueza",
    body: "A cada 6-8 semanas, faça uma semana de treino leve, use o treino Extra, com mais day-off. Isso previne overtraining, reduz lesões e muitas vezes resulta em um salto de performance na semana seguinte.",
    goals: [],
    levels: ["gt_1_year"],
    equipment: [],
    missingEquipment: [],
  },

  // ── Por objetivo ────────────────────────────────────────────────────────
  {
    id: "training_lose_weight_cardio",
    emoji: "🔥",
    title: "Combine treino com déficit calórico",
    body: "Para emagrecer, o exercício ajuda — mas a alimentação é responsável por 70% do resultado. Mantenha um déficit calórico moderado (300-500 kcal/dia) e não pule refeições.",
    goals: ["lose_weight"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_gain_muscle_volume",
    emoji: "💪",
    title: "Controle total do movimento",
    body: "Para hipertrofia, a tensão muscular é fundamental, principalmente da fase excêntrica, quando você deixa a carga vencer o músculo.",
    goals: ["gain_muscle"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_conditioning_hiit",
    emoji: "🏃",
    title: "Intervalos nos treinos de condicionamento",
    body: "Respeite os intervalos de descanso, se descansar demais perde o ritmo do treino e diminuindo os batimentos cardíacos",
    goals: ["improve_conditioning"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },

  // ── Dicas de uso do app ─────────────────────────────────────────────────
  {
    id: "training_app_weight_tracking",
    emoji: "📊",
    title: "Registre sua evolução de carga",
    body: "Use o botão 'Evolução de carga' em cada exercício para registrar quanto você levantou. Acompanhar a progressão é uma das formas mais motivadoras de ver sua evolução.",
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "training_app_substitute",
    emoji: "🔀",
    title: "Exercício difícil? Substitua sem culpa",
    body: "Se algum exercício do seu treino não se encaixa (dor, equipamento, preferência), use o botão 'Substituir' para trocar por uma alternativa equivalente.",
    goals: [],
    levels: ["no_training", "lt_6_months"],
    equipment: [],
    missingEquipment: [],
  },
];

// ─── ABA 2: NUTRIÇÃO ─────────────────────────────────────────────────────────

const nutrition: RecommendationCard[] = [
  // ── Pré-treino ──────────────────────────────────────────────────────────
  {
    id: "nutrition_pre_workout_carbs",
    emoji: "🍌",
    title: "O que comer antes do treino",
    body: "1-2h antes do treino, prefira carboidratos de fácil digestão: banana, tapioca, pão integral com mel, batata-doce. Eles fornecem energia rápida sem pesar no estômago.",
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_pre_workout_fasted",
    emoji: "⏰",
    title: "Treino em jejum: funciona?",
    body: "Para perda de peso, treinar em jejum pode ajudar — mas não é obrigatório. Se sentir tontura ou queda de performance, coma algo leve 30min antes. Escute seu corpo.",
    goals: ["lose_weight"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },

  // ── Pós-treino ──────────────────────────────────────────────────────────
  {
    id: "nutrition_post_workout_protein",
    emoji: "🥩",
    title: "Janela anabólica: proteína pós-treino",
    body: "Nos 30-60min após o treino, consuma proteína de qualidade: frango, ovos, atum, iogurte grego ou whey. Esse período é ideal para recuperação e crescimento muscular.",
    goals: ["gain_muscle", "body_recomposition"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_post_workout_hydration",
    emoji: "💧",
    title: "Reidrate-se após o treino",
    body: "Você perde entre 500ml e 1L de água em um treino de 45min. Beba pelo menos 500ml de água nos primeiros 30min após o treino para repor o que foi perdido.",
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },

  // ── O que evitar ────────────────────────────────────────────────────────
  {
    id: "nutrition_avoid_ultra_processed",
    emoji: "🚫",
    title: "Alimentos que sabotam seu treino",
    body: "Evite ultraprocessados, refrigerantes e frituras nos dias de treino. Eles causam inflamação, reduzem a recuperação muscular e comprometem sua energia.",
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_avoid_alcohol",
    emoji: "🍺",
    title: "Álcool e treino não combinam",
    body: "O álcool reduz a síntese proteica em até 37% e piora a qualidade do sono — os dois pilares da recuperação muscular. Evite nas 24h antes e após treinos intensos.",
    goals: ["gain_muscle", "body_recomposition"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },

  // ── Suplementos com afiliado ────────────────────────────────────────────
  {
    id: "nutrition_supplement_whey",
    emoji: "🥛",
    title: "Whey Protein — o mais versátil",
    body: "Ideal para completar a ingestão diária de proteína. Tome após o treino ou entre refeições. Busque opções com pelo menos 20g de proteína por dose e poucos ingredientes.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/1isKULn",
    },
    goals: ["gain_muscle", "body_recomposition"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_supplement_creatine",
    emoji: "⚡",
    title: "Creatina — o suplemento mais estudado",
    body: "A creatina aumenta força e performance em exercícios de alta intensidade. 3-5g por dia, qualquer horário. É segura, eficaz e aprovada por décadas de pesquisa.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/1ukxEFH",
    },
    goals: ["gain_muscle", "body_recomposition", "improve_conditioning"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_supplement_pre",
    emoji: "🔋",
    title: "Pré-treino — energia para treinar mais",
    body: "Se sente cansaço antes dos treinos, um bom pré-treino com cafeína pode ajudar. Use com moderação (máx. 4x/semana) e evite após as 17h para não afetar o sono.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/2yNJrEu",
    },
    goals: ["improve_conditioning", "lose_weight"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_supplement_omega3",
    emoji: "🐟",
    title: "Ômega 3 — recuperação e saúde geral",
    body: "O ômega 3 reduz a inflamação muscular pós-treino e melhora a saúde cardiovascular. 2-3g/dia com as refeições. Um dos suplementos mais subestimados por quem treina.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/18v6dfF",
    },
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
  {
    id: "nutrition_supplement_thermogenic",
    emoji: "🌡️",
    title: "Termogênico — acelerador do metabolismo",
    body: "Para quem quer emagrecer, um termogênico pode aumentar o gasto calórico em repouso. Combine com alimentação adequada — sozinho o efeito é limitado.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/1wvBqdD",
    },
    goals: ["lose_weight"],
    levels: [],
    equipment: [],
    missingEquipment: [],
  },
];

// ─── ABA 3: EQUIPAMENTOS ─────────────────────────────────────────────────────

const equipment: RecommendationCard[] = [
  // ── Para quem não tem nada ──────────────────────────────────────────────
  {
    id: "equip_first_dumbbells",
    emoji: "🏋️",
    title: "Halteres — o primeiro passo",
    body: "Se você vai comprar apenas um equipamento, que seja um par de halteres ajustáveis. Eles multiplicam as possibilidades do treino em casa e servem para qualquer nível.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/343oRzE",
    },
    goals: ["gain_muscle", "body_recomposition"],
    levels: ["no_training", "lt_6_months", "6_to_12_months"],
    equipment: [],
    missingEquipment: ["halteres"],
  },
  {
    id: "equip_first_elastic",
    emoji: "🟡",
    title: "Elásticos — versatilidade por R$30",
    body: "Um kit de faixas elásticas é o equipamento mais custo-efetivo que existe. Leve, versátil, serve para aquecer, fortalecer e reabilitar. Ótimo ponto de entrada.",
    link: {
      label: "Minha recomendação →",
      url: "https://meli.la/2cFcrSY",
    },
    goals: [],
    levels: ["no_training", "lt_6_months"],
    equipment: [],
    missingEquipment: ["elasticos"],
  },

  // ── Para intermediários ─────────────────────────────────────────────────
  {
    id: "equip_kettlebell",
    emoji: "🔔",
    title: "Kettlebell — força e condicionamento juntos",
    body: "O kettlebell é ideal para treinos funcionais que combinam força e cardio. Um único kettlebell de 12-16kg abre dezenas de exercícios eficientes para treino em casa.",
    link: {
      label: "Minha Recomendação →",
      url: "https://meli.la/1CjY929",
    },
    goals: ["improve_conditioning", "lose_weight", "body_recomposition"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: ["kettlebell"],
  },
  {
    id: "equip_suspension",
    emoji: "🪢",
    title: "Fita de suspensão — seu ginásio na porta",
    body: "Com uma fita de suspensão (TRX) e uma porta, você tem acesso a mais de 100 exercícios usando o peso do próprio corpo. Ótimo para quem quer treinar sério em casa.",
    link: {
      label: "Minha Recomendação →",
      url: "https://meli.la/1z6Amnc",
    },
    goals: ["gain_muscle", "body_recomposition", "improve_conditioning"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: ["fita_suspensa"],
  },

  // ── Para avançados ──────────────────────────────────────────────────────
  {
    id: "equip_ab_wheel",
    emoji: "⚙️",
    title: "Roda abdominal — o core no limite",
    body: "A roda abdominal é um dos exercícios mais eficientes para o core, mas exige uma base sólida. Recomendada apenas após 6+ meses de treino consistente.",
    link: {
      label: "Minha Recomendação →",
      url: "https://meli.la/2u4aYWi",
    },
    goals: ["gain_muscle", "body_recomposition"],
    levels: ["6_to_12_months", "gt_1_year"],
    equipment: [],
    missingEquipment: ["rolo_abdominal"],
  },

  // ── Dicas de uso para quem já tem equipamento ──────────────────────────
  {
    id: "equip_use_elastic_tip",
    emoji: "💡",
    title: "Aproveitando melhor seus elásticos",
    body: "Use os elásticos no aquecimento para ativar glúteos e ombros antes dos exercícios principais. Isso melhora a ativação muscular e reduz o risco de lesão.",
    goals: [],
    levels: [],
    equipment: ["elasticos"],
    missingEquipment: [],
  },
  {
    id: "equip_use_fitball_tip",
    emoji: "🏐",
    title: "Fitball mais do que uma bola",
    body: "O fitball é excelente para trabalhar estabilidade e core em qualquer exercício. Pode ser usado como banco em inúmeros exercícios.",
    link: {
      label: "Minha Recomendação →",
      url: "https://meli.la/1TxAq3r",
    },
    goals: [],
    levels: [],
    equipment: [],
    missingEquipment: ["fitball"],
  },
];

// ─── EXPORT PRINCIPAL ─────────────────────────────────────────────────────────

export const RECOMMENDATIONS_DATA: RecommendationsData = {
  training,
  nutrition,
  equipment,
};
