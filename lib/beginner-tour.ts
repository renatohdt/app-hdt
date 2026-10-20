// ─────────────────────────────────────────────────────────────────────────────
// Dicas do 1º treino para iniciantes (Renato, out/2026)
//
// Quem vê: selo "Iniciante" que ainda não concluiu nenhum treino (1º acesso).
// Como funciona: um contorno destaca a ferramenta, o resto da tela escurece e
// uma caixa explica. Só dá para tocar em "Pular dicas" ou "Entendi" — tocar
// fora não faz nada (para ninguém perder a dica sem querer).
// Cada dica aparece UMA vez (fica salvo no aparelho). "Pular dicas" encerra todas.
//
// Para mudar um texto, é só editar aqui. Para criar dicas novas no futuro
// (ex.: circuito e drop-set ao chegar no intermediário), crie um novo grupo.
// ─────────────────────────────────────────────────────────────────────────────

export type TourContext = {
  /** Ex.: "Sessão 1 de 10" */
  sessionLabel: string;
  totalSessions: number;
};

export type TourStep = {
  id: string;
  /** Valor do atributo data-tour do elemento destacado. */
  target: string;
  /** Formato do destaque: "pill" para botões redondos/arredondados. */
  shape?: "rounded" | "pill";
  title: (ctx: TourContext) => string;
  text: (ctx: TourContext) => string;
};

export type TourGroupId = "screen" | "exercise" | "finish";

export const TOUR_GROUPS: Record<TourGroupId, TourStep[]> = {
  // Momento 1 — ao abrir a tela de treino
  screen: [
    {
      id: "session",
      target: "session-badge",
      shape: "pill",
      title: (ctx) => `${ctx.sessionLabel} · Seu programa tem começo, meio e fim`,
      text: (ctx) =>
        `Montei um programa com ${ctx.totalSessions} sessões de treino para você. Ao completar todas, vou montar um programa novo para seu corpo não se adaptar e você continuar tendo bons resultados.`
    },
    {
      id: "tabs",
      target: "workout-tabs",
      title: () => "Treino A, B, C · Sua semana de treino",
      text: () =>
        "Esses são os treinos criados para a sua semana. Comece pelo A e faça um por dia, nos dias que você escolheu treinar. Faltou um dia? É só continuar de onde parou. Não se preocupe, eu te ajudo a lembrar!"
    },
    {
      id: "list",
      target: "first-exercise",
      title: () => "Lista de exercícios · Tudo tem uma ordem",
      text: () =>
        "A ordem foi pensada e tem um propósito. Siga de cima para baixo. Não se preocupe: quando você começar, eu mostro e explico qual é o seu próximo exercício."
    },
    {
      id: "start",
      target: "start-workout",
      shape: "pill",
      title: () => "Iniciar treino · Bora começar?",
      text: () => "Toque aqui quando for treinar. Eu marco o tempo e te acompanho até o final. Estou pronto!"
    }
  ],
  // Momento 2 — ao abrir o primeiro exercício
  exercise: [
    {
      id: "exercise-check",
      target: "exercise-check",
      shape: "pill",
      title: () => "Check do exercício · Marque o que já fez",
      text: () =>
        "Terminou um exercício? Marque aqui. Assim você não se perde no treino, eu registro cada passo da sua evolução e já te mostro o próximo exercício."
    },
    {
      id: "video",
      target: "exercise-video",
      shape: "pill",
      title: () => "Vídeo · Veja antes de fazer",
      text: () =>
        "Assista ao vídeo antes da primeira série. Fazer o movimento certo é o que traz resultado e evita lesão. A carga vem depois."
    },
    {
      id: "sets",
      target: "exercise-set-row",
      title: () => "Séries e repetições · Como ler seu treino",
      text: () =>
        "Cada linha é uma série. Faça as repetições indicadas sem parar e anote quantas fez, para eu saber sua dificuldade. Depois descanse e passe para a próxima linha."
    },
    {
      id: "weight",
      target: "exercise-weight",
      title: () => "Carga · Qual peso usar?",
      text: () =>
        "Escolha um peso em que as 2 últimas repetições fiquem difíceis, mas sem perder a postura. Anote aqui: assim eu conheço sua força, e na próxima vez você sabe de onde partir e vê o quanto evoluiu."
    }
  ],
  // Momento 3 — na janela de "Treino completo!" / "Finalizar treino?"
  finish: [
    {
      id: "finish",
      target: "finish-feedback",
      title: () => "Finalizar o treino · Acabou, avalie e encerre!",
      text: () =>
        "Missão cumprida! Agora é só avaliar como foi o seu treino e tocar em Confirmar. Vou usar essas avaliações e o tempo do treino para montar seus próximos treinos."
    }
  ]
};

// ── Memória das dicas já vistas (por usuário, neste aparelho) ───────────────

export type TourState = { seen: string[]; skipped: boolean };

const storageKey = (userId: string) => `hdt:beginner-tour:v1:${userId}`;

export function readTourState(userId: string): TourState {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return { seen: [], skipped: false };
    const parsed = JSON.parse(raw) as Partial<TourState>;
    return {
      seen: Array.isArray(parsed.seen) ? parsed.seen.filter((id): id is string => typeof id === "string") : [],
      skipped: parsed.skipped === true
    };
  } catch {
    return { seen: [], skipped: false };
  }
}

export function writeTourState(userId: string, state: TourState) {
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    // Sem armazenamento (modo privado etc.): as dicas só não ficam lembradas.
  }
}
