// Textos das notificações automáticas. Ajuste à vontade: cada lista tem
// variações e o motor escolhe uma de forma estável por pessoa/dia.
import { pickVariant } from "@/lib/notification-rules";

export type NotificationText = { title: string; body: string; url: string };

function pick(seed: string, options: Omit<NotificationText, "url">[], url: string): NotificationText {
  return { ...options[pickVariant(seed, options.length)], url };
}

// ── Treino do dia ────────────────────────────────────────────────────────────
export function treinoDoDiaText(seed: string): NotificationText {
  return pick(
    seed,
    [
      { title: "Hoje é dia de treino 💪", body: "Daqui a pouco é a sua hora. Seu treino já está pronto no app." },
      { title: "Seu treino de hoje te espera ✅", body: "Separei tudo pra você. É só abrir e dar o play." },
      { title: "A Hora do Treino está chegando ⏰", body: "No seu horário de sempre. O você de amanhã agradece." }
    ],
    "/treino"
  );
}

export function treinoAmanhaCedoText(seed: string): NotificationText {
  return pick(
    seed,
    [
      { title: "Amanhã cedo tem treino 🌅", body: "Deixa a roupa separada. Seu treino já está pronto no app." },
      { title: "Despertador + treino = combo 🔥", body: "Amanhã de manhã é dia de treino. Dorme cedo que eu te espero!" }
    ],
    "/treino"
  );
}

// ── Dias sem treinar (escada) ────────────────────────────────────────────────
// level = dias sem treinar que dispararam a mensagem.
export function semTreinarText(seed: string, level: number, isLast: boolean): NotificationText {
  if (isLast) {
    return {
      title: "A porta continua aberta 🚪",
      body: "Faz um mês desde o último treino. Seu programa te espera quando você quiser recomeçar.",
      url: "/treino"
    };
  }
  if (level === 13) {
    return {
      title: "Seu XP vai começar a derreter 🫠",
      body: "Com 14 dias sem treinar você começa a perder XP. Um treino hoje e está tudo salvo.",
      url: "/treino"
    };
  }
  return pick(
    seed,
    [
      { title: "Sentimos sua falta 👀", body: `Já são ${level} dias sem treino. Que tal voltar hoje, nem que seja um treino curtinho?` },
      { title: "Seus músculos mandaram um recado 💌", body: `"Lembra da gente?" São ${level} dias sem treinar. Bora retomar?` },
      { title: "O sofá está ganhando 🛋️", body: `${level} dias sem treino. Vira esse jogo hoje, seu treino está prontinho.` }
    ],
    "/treino"
  );
}

// ── Medidas do mês ───────────────────────────────────────────────────────────
export function medidasText(hasHistory: boolean): NotificationText {
  return hasHistory
    ? {
        title: "Dia de conferir a evolução 📏",
        body: "Já faz um mês das suas últimas medidas. Anote as novas e compare o antes e depois.",
        url: "/calendario?tab=corpo"
      }
    : {
        title: "Registre seu ponto de partida 📏",
        body: "Anote suas medidas hoje. Daqui a 30 dias você vai querer comparar.",
        url: "/calendario?tab=corpo"
      };
}

// ── Avisos de conta ──────────────────────────────────────────────────────────
export function pagamentoFalhouText(): NotificationText {
  return {
    title: "Não conseguimos renovar seu Premium 💳",
    body: "Houve um problema com o pagamento. Confira seu cartão para não perder seus benefícios.",
    url: "/perfil"
  };
}

export function pagamentoLojaFalhouText(): NotificationText {
  return {
    title: "Problema no pagamento da assinatura 💳",
    body: "A loja não conseguiu fazer a cobrança. Atualize a forma de pagamento para manter o Premium.",
    url: "/perfil"
  };
}

// ── Indique e Ganhe ──────────────────────────────────────────────────────────
export function indicacaoText(remaining: number): NotificationText {
  return {
    title: "Mais um amigo entrou! 🎉",
    body:
      remaining === 1
        ? "Alguém começou a treinar com seu convite. Falta só 1 para você ganhar 30 dias de Premium!"
        : `Alguém começou a treinar com seu convite. Faltam ${remaining} para você ganhar 30 dias de Premium.`,
    url: "/dashboard"
  };
}

export function indicacaoPremioText(): NotificationText {
  return {
    title: "Você ganhou 30 dias de Premium! 🏆",
    body: "5 amigos entraram com seu convite. Aproveite o Premium por nossa conta.",
    url: "/dashboard"
  };
}
