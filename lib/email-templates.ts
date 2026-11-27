import "server-only";

import type { CancellationReason } from "@/lib/cancellation-feedback";
import type { EmailContent } from "@/lib/email";

// ─────────────────────────────────────────────────────────────────────────────
// Textos dos e-mails estratégicos. Layout igual ao padrão usado no LeadLovers
// (cabeçalho escuro, corpo branco, bloco de destaque verde, assinatura do Renato).
// Voz: o personal falando com o aluno, em primeira pessoa, com leveza e humor.
// ─────────────────────────────────────────────────────────────────────────────

const APP_URL = "https://app.horadotreino.com.br";
const DASHBOARD_URL = `${APP_URL}/dashboard`;
const PLANS_URL = `${APP_URL}/escolher-plano`;
const PROGRAMS_URL = `${APP_URL}/programas`;
const PRIVACY_URL = `${APP_URL}/privacidade`;
const INSTAGRAM_URL = "https://www.instagram.com/horadotreino_oficial/";

const FONT = "font-family: Arial, Helvetica, sans-serif;";
const P = `margin: 0 0 16px; ${FONT} font-size: 15px; color: #1a1a1a; line-height: 1.7;`;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function hello(firstName: string | null) {
  return firstName ? `Olá, ${escapeHtml(firstName)}!` : "Olá!";
}

function helloText(firstName: string | null) {
  return firstName ? `Olá, ${firstName}!` : "Olá!";
}

const p = (html: string) => `<p style="${P}">${html}</p>`;

const highlight = (title: string, body: string) => `
      <div style="border-left: 4px solid #1db954; background-color: #f7f7f5; padding: 16px 20px; margin: 0 0 24px; border-radius: 0 8px 8px 0;">
        <p style="margin: 0 0 8px; ${FONT} font-size: 16px; font-weight: 700; color: #1a1a1a; line-height: 1.6;">${title}</p>
        <p style="margin: 0; ${FONT} font-size: 14px; color: #444444; line-height: 1.6;">${body}</p>
      </div>`;

const checklist = (items: string[]) => `
      <div style="background-color: #f7f7f5; border: 1px solid #e0e0e0; border-radius: 8px; padding: 16px 20px; margin: 0 0 24px;">
        ${items
          .map(
            (item, i) =>
              `<p style="margin: 0 0 ${i === items.length - 1 ? 0 : 8}px; ${FONT} font-size: 14px; color: #1a1a1a; line-height: 1.6;">✓ ${item}</p>`
          )
          .join("\n        ")}
      </div>`;

// Botão principal (verde) — mais clicável que link de texto.
const button = (label: string, href: string) => `
      <p style="margin: 8px 0 32px; text-align: center;">
        <a href="${href}" target="_blank" style="display: inline-block; background-color: #1db954; color: #0d1a0f; ${FONT} font-size: 16px; font-weight: 700; text-decoration: none; padding: 14px 28px; border-radius: 10px;">${label}</a>
      </p>`;

// Link secundário (padrão de texto verde do LeadLovers).
const textLink = (label: string, href: string) => `
      <p style="margin: 0 0 28px; text-align: center;">
        <a href="${href}" target="_blank" style="color: #1db954; ${FONT} font-size: 14px; font-weight: 700; text-decoration: none;">${label}</a>
      </p>`;

function layout(opts: { title: string; preheader: string; body: string; marketing: boolean }) {
  const unsubscribe = opts.marketing
    ? `<p style="margin: 8px 0 0; ${FONT} font-size: 11px; color: #aaaaaa;">
          Não quer mais receber dicas e ofertas? <a href="${PRIVACY_URL}" target="_blank" style="color: #aaaaaa;">Ajuste suas preferências</a>.
        </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${opts.title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f0; ${FONT}">
  <div style="display: none; max-height: 0px; overflow: hidden;">${opts.preheader} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
  <div style="max-width: 560px; margin: 32px auto; padding: 0 16px;">
    <div style="background-color: #0d1a0f; border-radius: 12px 12px 0 0; padding: 24px 32px; text-align: center;">
      <span style="color: #e8f5e9; ${FONT} font-size: 15px; font-weight: 700;">Hora do Treino</span>
    </div>
    <div style="background-color: #ffffff; border-left: 1px solid #e0e0e0; border-right: 1px solid #e0e0e0; padding: 32px;">
${opts.body}
      <p style="text-align: center; margin: 32px 0 10px;">
        <img src="${APP_URL}/email/renato-assinatura.png" width="72" height="72" alt="Renato Santiago" style="display: inline-block; width: 72px; height: 72px; border: 0; border-radius: 50%;">
      </p>
      <p style="text-align: center; margin: 0 0 4px; ${FONT} font-size: 15px; color: #1a1a1a;">Bons treinos,</p>
      <p style="text-align: center; margin: 0 0 4px; ${FONT} font-size: 14px; font-weight: 700; color: #1a1a1a;"><strong>Renato Santiago</strong></p>
      <p style="text-align: center; margin: 0; ${FONT} font-size: 12px; color: #888888;">Personal Trainer · Hora do Treino</p>
    </div>
    <div style="background-color: #f0f0ec; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none; padding: 16px 24px; text-align: center;">
      <p style="margin: 0; ${FONT} font-size: 12px; color: #aaaaaa;">
        Hora do Treino® · CNPJ: 34.229.533/0001-61 ·
        <a href="${APP_URL}" target="_blank" style="color: #aaaaaa; text-decoration: none;">app.horadotreino.com.br</a>
      </p>
      ${unsubscribe}
    </div>
  </div>
</body>
</html>`;
}

const SIGNATURE_TEXT = "\n\nBons treinos,\nRenato Santiago\nPersonal Trainer · Hora do Treino";

// ─── 1. Viu o popup Premium 3x (usuário free do app) — oferta do preço do site ───
// Também usado quando a pessoa toca em "Tenho interesse" no Premium (requested = true):
// muda só o assunto e a abertura, porque aí foi ela quem pediu.
export function premiumOfferEmail(firstName: string | null, opts?: { requested?: boolean }): EmailContent {
  const requested = Boolean(opts?.requested);
  const subject = requested
    ? "Você pediu: o Premium do jeito mais barato"
    : "Tenha mais resultado, assine o Premium e ainda pague mais barato";
  const preheader = "No site sai a partir de R$ 9,90/mês. Menos que uma dose de whey por dia.";
  const opening = requested
    ? "Você pediu para saber mais sobre o Premium, então aqui vai, com um segredo que a loja do celular não conta:"
    : "Percebi que você ficou de olho no Premium. Então deixa eu te contar um segredo que a loja do celular não conta:";
  const body = [
    p(hello(firstName)),
    p(opening),
    highlight(
      "Assinando pelo site, o Premium sai mais barato",
      "Na loja o mensal custa R$ 19,90. Pelo site é <strong>R$ 14,90/mês</strong> — ou <strong>R$ 9,90/mês no plano anual</strong> (R$ 118,80 no cartão ou PIX). Dá uns 33 centavos por dia: menos que uma dose de whey (e bem mais gostoso)."
    ),
    p("E o que muda no seu treino:"),
    checklist([
      "Programas novos sem limite, evoluindo com o seu feedback de cada treino",
      "Evolução de carga em gráfico — você vê a força crescendo",
      "Minha semana: você escolhe os dias e eu organizo os treinos",
      "Trocas de exercício ilimitadas, escolhendo entre opções que eu indico",
      "App sem anúncios"
    ]),
    p("É a mesma conta: assina pelo site com o seu e-mail e o Premium já aparece no app."),
    button("Quero o Premium pelo site →", PLANS_URL),
    p("Pode responder este e-mail se ficar qualquer dúvida. Quem lê sou eu.")
  ].join("\n");

  const text = `${helloText(firstName)}

${requested ? "Você pediu para saber mais sobre o Premium." : "Percebi que você ficou de olho no Premium."} Um segredo que a loja do celular não conta: pelo site ele sai mais barato.

Na loja o mensal custa R$ 19,90. Pelo site é R$ 14,90/mês — ou R$ 9,90/mês no plano anual (R$ 118,80 no cartão ou PIX). Uns 33 centavos por dia.

No Premium você tem:
- Programas novos sem limite, evoluindo com o seu feedback
- Evolução de carga em gráfico
- Minha semana: você escolhe os dias e eu organizo os treinos
- Trocas de exercício ilimitadas
- App sem anúncios

É a mesma conta: assina pelo site com o seu e-mail e o Premium já aparece no app.

Assinar pelo site: ${PLANS_URL}

Dúvidas? É só responder este e-mail.${SIGNATURE_TEXT}`;

  return { subject, html: layout({ title: subject, preheader, body, marketing: true }), text };
}

// ─── 2. Acabou de assinar ───
export function premiumWelcomeEmail(firstName: string | null): EmailContent {
  const subject = "Agora seu treino ficou sério: bem-vindo(a) ao Premium 💪";
  const preheader = "4 coisas para fazer nesta semana e tirar o máximo do seu Premium.";
  const body = [
    p(hello(firstName)),
    p("Obrigado pela confiança! A partir de agora eu acompanho a sua evolução de perto. E para isso funcionar de verdade, preciso de você em 4 coisas:"),
    checklist([
      "<strong>Dê o feedback no fim de cada treino.</strong> É com ele que eu ajusto o próximo programa — fácil demais sobe, difícil demais desce.",
      "<strong>Monte a sua semana.</strong> Em Evolução → Minha semana, escolha seus dias e eu organizo a ordem dos treinos.",
      "<strong>Anote as cargas.</strong> O gráfico de evolução vira o seu melhor motivador.",
      "<strong>Não gostou de um exercício? Troque.</strong> Agora é sem limite, e eu te mostro as opções."
    ]),
    highlight(
      "Uma dica de personal",
      "Resultado vem de constância, não de treino perfeito. Melhor 3 treinos por semana todas as semanas do que 6 em uma e nenhum na outra."
    ),
    button("Abrir meu treino →", DASHBOARD_URL),
    p("Me responde este e-mail contando qual é o seu objetivo agora. Eu leio todos.")
  ].join("\n");

  const text = `${helloText(firstName)}

Obrigado pela confiança! A partir de agora eu acompanho a sua evolução de perto. Para funcionar de verdade, preciso de você em 4 coisas:

1. Dê o feedback no fim de cada treino — é com ele que eu ajusto o próximo programa.
2. Monte a sua semana em Evolução → Minha semana.
3. Anote as cargas: o gráfico de evolução vira o seu melhor motivador.
4. Não gostou de um exercício? Troque — agora é sem limite.

Dica de personal: resultado vem de constância, não de treino perfeito.

Abrir meu treino: ${DASHBOARD_URL}

Me responde contando qual é o seu objetivo agora. Eu leio todos.${SIGNATURE_TEXT}`;

  return { subject, html: layout({ title: subject, preheader, body, marketing: false }), text };
}

// ─── 3. Cancelou o plano ───
// O parágrafo do meio muda conforme o motivo escolhido no questionário.
const CANCEL_REASON_COPY: Partial<Record<CancellationReason, { html: string; text: string }>> = {
  caro: {
    html: `Você comentou que está pesando no bolso. Entendo totalmente. Só para você saber: pelo site, o plano anual sai por <strong>R$ 9,90/mês</strong> (R$ 118,80 no cartão ou PIX) — uns 33 centavos por dia. Se fizer sentido mais pra frente, <a href="${PLANS_URL}" target="_blank" style="color: #1db954; font-weight: 700; text-decoration: none;">é por aqui</a>.`,
    text: `Você comentou que está pesando no bolso. Entendo. Pelo site, o plano anual sai por R$ 9,90/mês (R$ 118,80 no cartão ou PIX). Se fizer sentido mais pra frente: ${PLANS_URL}`
  },
  sem_tempo: {
    html: "Você comentou que está sem tempo. Uma dica: no seu perfil dá para mudar o tempo de treino para 15 ou 30 minutos. Um treino curto feito vale muito mais que um treino longo adiado.",
    text: "Você comentou que está sem tempo. Dica: no perfil dá para mudar o tempo de treino para 15 ou 30 minutos. Treino curto feito vale mais que treino longo adiado."
  },
  treinos_nao_combinam: {
    html: "Você comentou que os treinos não combinaram com você. Isso me incomoda de verdade — me responde contando o que não encaixou (exercícios, tempo, nível, local)? É assim que eu melhoro o método.",
    text: "Você comentou que os treinos não combinaram com você. Me responde contando o que não encaixou? É assim que eu melhoro o método."
  },
  sem_resultado: {
    html: "Você comentou que não estava vendo resultado. Me responde contando seu objetivo e quantas vezes por semana você treinava? Quero entender e, se der, te dar uma orientação — sem compromisso.",
    text: "Você comentou que não estava vendo resultado. Me responde contando seu objetivo e quantas vezes por semana treinava? Quero te dar uma orientação, sem compromisso."
  },
  problemas_no_app: {
    html: "Você comentou que o app deu problema. Me desculpe por isso. Me responde contando o que aconteceu (e em qual celular)? Eu mesmo vou atrás para corrigir.",
    text: "Você comentou que o app deu problema. Me desculpe. Me responde contando o que aconteceu e em qual celular? Eu mesmo vou atrás para corrigir."
  }
};

export function premiumCanceledEmail(firstName: string | null, reason: CancellationReason | null): EmailContent {
  const subject = "Posso te pedir 1 minuto?";
  const preheader = "Seu Premium continua até o fim do período — e eu queria entender o que faltou.";
  const reasonCopy = reason ? CANCEL_REASON_COPY[reason] : undefined;

  const body = [
    p(hello(firstName)),
    p("Vi que você cancelou o Premium. Sem drama: o seu acesso continua até o fim do período que você já pagou, e depois a sua conta segue no plano gratuito — com os seus treinos e o seu histórico."),
    reasonCopy
      ? p(reasonCopy.html)
      : p("Se puder, me responde este e-mail com uma frase: <strong>o que faltou para valer a pena?</strong> Eu leio todas as respostas, e é assim que eu melhoro o app."),
    highlight(
      "O mais importante não é o plano",
      "É você não parar de treinar. Se o gratuito é o que cabe agora, ótimo — continua comigo por lá."
    ),
    textLink("Continuar treinando →", DASHBOARD_URL)
  ].join("\n");

  const text = `${helloText(firstName)}

Vi que você cancelou o Premium. Sem drama: o seu acesso continua até o fim do período já pago, e depois a sua conta segue no plano gratuito, com seus treinos e histórico.

${reasonCopy ? reasonCopy.text : "Se puder, me responde com uma frase: o que faltou para valer a pena? Eu leio todas."}

O mais importante não é o plano: é você não parar de treinar.

Continuar treinando: ${DASHBOARD_URL}${SIGNATURE_TEXT}`;

  return { subject, html: layout({ title: subject, preheader, body, marketing: false }), text };
}

// ─── 4. Concluiu 10 treinos ───
// Free: comemora e convida para o Premium. Premium: comemora e pede depoimento/marcação.
export function milestone10WorkoutsEmail(firstName: string | null, isPremium: boolean): EmailContent {
  const subject = "10 treinos. Eu estou orgulhoso de você 🏆";
  const preheader = isPremium
    ? "Você entrou para um grupo pequeno: quem não desiste no começo."
    : "Você passou da fase em que quase todo mundo desiste. Agora vem a melhor parte.";

  const shared = [
    p(hello(firstName)),
    p("Você acabou de completar <strong>10 treinos</strong> no Hora do Treino. Sabe o que isso significa? A maioria das pessoas desiste antes do 5º. Você não."),
    highlight(
      "A partir daqui o corpo começa a responder",
      "As primeiras semanas são adaptação. Agora vem a fase em que força, disposição e o espelho começam a mudar de verdade."
    )
  ];

  const body = isPremium
    ? [
        ...shared,
        p("Quero te pedir um favor: <strong>me responde este e-mail contando como você está se sentindo</strong> desde que começou. Pode ser uma frase. Com a sua autorização, a sua história pode inspirar quem ainda está pensando em começar."),
        p("E se postar o treino, me marca no Instagram que eu faço questão de ver:"),
        button("Marcar @horadotreino_oficial →", INSTAGRAM_URL),
        textLink("Ir para o próximo treino →", DASHBOARD_URL)
      ].join("\n")
    : [
        ...shared,
        p("E é exatamente agora que o Premium faz mais diferença. Você já criou o hábito — o Premium faz o treino <strong>evoluir junto com você</strong>:"),
        checklist([
          "Programas novos sem limite, ajustados pelo seu feedback",
          "Evolução de carga em gráfico (ver os números subindo vicia)",
          "Minha semana organizada do seu jeito",
          "Trocas ilimitadas e sem anúncios"
        ]),
        p("Pelo site sai a partir de <strong>R$ 9,90/mês</strong> no plano anual."),
        button("Evoluir para o Premium →", PLANS_URL),
        textLink("Ou seguir para o próximo treino →", DASHBOARD_URL)
      ].join("\n");

  const text = isPremium
    ? `${helloText(firstName)}

Você completou 10 treinos no Hora do Treino. A maioria desiste antes do 5º. Você não.

A partir daqui o corpo começa a responder de verdade.

Um favor: me responde contando como você está se sentindo desde que começou. Pode ser uma frase.

Se postar o treino, marca @horadotreino_oficial no Instagram: ${INSTAGRAM_URL}

Próximo treino: ${DASHBOARD_URL}${SIGNATURE_TEXT}`
    : `${helloText(firstName)}

Você completou 10 treinos no Hora do Treino. A maioria desiste antes do 5º. Você não.

A partir daqui o corpo começa a responder — e é agora que o Premium faz mais diferença:
- Programas novos sem limite, ajustados pelo seu feedback
- Evolução de carga em gráfico
- Minha semana organizada do seu jeito
- Trocas ilimitadas e sem anúncios

Pelo site sai a partir de R$ 9,90/mês no plano anual: ${PLANS_URL}

Próximo treino: ${DASHBOARD_URL}${SIGNATURE_TEXT}`;

  return { subject, html: layout({ title: subject, preheader, body, marketing: true }), text };
}

// ─── 5. Tocou em "Tenho interesse" em um Programa (app) — compra pelo site ───
export type ProgramEmailInfo = {
  title: string;
  description: string | null;
  durationWeeks: number | null;
  sessionsPerWeek: number | null;
  priceCents: number | null;
  compareAtCents: number | null;
};

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function programInterestEmail(firstName: string | null, program: ProgramEmailInfo): EmailContent {
  const title = escapeHtml(program.title);
  const subject = `${program.title}: como garantir o seu`;
  const preheader = "Montei cada semana pessoalmente. A compra é pelo site, em poucos minutos.";

  const details = [
    program.durationWeeks ? `${program.durationWeeks} semanas de treino montadas por mim, semana a semana` : null,
    program.sessionsPerWeek ? `${program.sessionsPerWeek} treinos por semana, com vídeo de cada exercício` : null,
    "Premium liberado durante todo o programa",
    "Pagamento único, sem mensalidade"
  ].filter(Boolean) as string[];

  const hasAnchor = Boolean(program.priceCents && program.compareAtCents && program.compareAtCents > program.priceCents);
  const price = program.priceCents ? formatBRL(program.priceCents) : null;
  const anchor = hasAnchor ? formatBRL(program.compareAtCents as number) : null;
  const priceHtml = price
    ? anchor
      ? `De <s>${anchor}</s> por <strong>${price}</strong>, pagamento único.`
      : `<strong>${price}</strong>, pagamento único.`
    : "";
  const priceText = price ? (anchor ? `De ${anchor} por ${price}, pagamento único.` : `${price}, pagamento único.`) : "";

  const body = [
    p(hello(firstName)),
    p(`Vi que você se interessou pelo <strong>${title}</strong>. Boa escolha: esse eu montei pessoalmente, como faria com um aluno meu.`),
    highlight(title, program.description ? escapeHtml(program.description) : "Um programa completo, com começo, meio e fim."),
    checklist(details.map(escapeHtml)),
    priceHtml ? p(priceHtml) : "",
    p("Pela regra das lojas, a compra não pode ser feita dentro do app. É pelo site, com a mesma conta, e assim que pagar o programa aparece no seu app."),
    button("Garantir meu programa →", PROGRAMS_URL),
    p("Ficou com dúvida se ele serve para você? Me responde este e-mail.")
  ].join("\n");

  const text = `${helloText(firstName)}

Vi que você se interessou pelo ${program.title}. Esse eu montei pessoalmente, como faria com um aluno meu.

${details.map((d) => `- ${d}`).join("\n")}

${priceText}

A compra é pelo site, com a mesma conta. Assim que pagar, o programa aparece no seu app.

Garantir meu programa: ${PROGRAMS_URL}

Dúvidas? É só responder este e-mail.${SIGNATURE_TEXT}`;

  return { subject, html: layout({ title: subject, preheader, body, marketing: false }), text };
}
