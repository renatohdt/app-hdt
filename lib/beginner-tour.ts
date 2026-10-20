// ─────────────────────────────────────────────────────────────────────────────
// Dicas do 1º treino para iniciantes (Renato, out/2026)
//
// Quem vê: Home → qualquer nível, logo após o cadastro (nenhum treino concluído).
//          Tela de treino → selo "Iniciante" que ainda não concluiu nenhum treino.
// Como funciona: um contorno destaca a ferramenta, o resto da tela escurece e
// uma caixa explica. Só dá para tocar em "Pular dicas" ou "Entendi" — tocar
// fora não faz nada (para ninguém perder a dica sem querer).
// Cada dica aparece UMA vez (fica salvo no aparelho). "Pular dicas" encerra todas.
//
// Para mudar um texto, é só editar aqui. Para criar dicas novas no futuro
// (ex.: circuito e drop-set ao chegar no intermediário), crie um novo grupo.
// ─────────────────────────────────────────────────────────────────────────────

export type TourContext = {
  /** Ex.: "Sessão 1 de 10" (tela de treino) */
  sessionLabel?: string;
  totalSessions?: number;
  /** Primeiro nome do usuário (Home) */
  firstName?: string | null;
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

export type TourGroupId = "home" | "screen" | "exercise" | "finish";

export const TOUR_GROUPS: Record<TourGroupId, TourStep[]> = {
  // Home — logo após o cadastro (qualquer nível, nenhum treino concluído)
  home: [
    {
      id: "home-level",
      target: "home-level",
      shape: "pill",
      title: () => "Seu nível",
      text: (ctx) =>
        `Olá${ctx.firstName ? `, ${ctx.firstName}` : ""}! Esse é o nível que eu recomendei para você, e seu treino foi montado com base nele. Se não concordar, você pode alterar depois em Perfil › Dados de treino.`
    },
    {
      id: "home-goal",
      target: "home-goal",
      title: () => "Crie uma meta pessoal",
      text: () =>
        "Defina quantos treinos você pretende fazer e em quanto tempo. Estudos mostram que, quando você se desafia, você vai mais longe!"
    },
    {
      id: "home-workout",
      target: "home-workout",
      title: () => "Já viu seu treino do dia?",
      text: () =>
        "Aqui eu mostro qual é o seu treino do dia, o tempo que planejei e a quantidade de exercícios. Está ansioso para iniciar o treino? Eu também!"
    }
  ],
  // Momento 1 — ao abrir a tela de treino
  screen: [
    {
      id: "session",
      target: "session-badge",
      shape: "pill",
      title: (ctx) => `${ctx.sessionLabel ?? "Sessões"} · Seu programa tem começo, meio e fim`,
      text: (ctx) =>
        `Montei um programa com ${ctx.totalSessions ?? "várias"} sessões de treino para você. Ao completar todas, vou montar um programa novo para seu corpo não se adaptar e você continuar tendo bons resultados.`
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
    },
    {
      id: "replace",
      target: "exercise-replace",
      title: () => "Não vai rolar esse exercício?",
      text: () =>
        "Às vezes eu posso colocar um exercício que você não vai conseguir fazer. Sem problema: é só tocar em Substituir que eu procuro outro para o mesmo grupo muscular."
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
