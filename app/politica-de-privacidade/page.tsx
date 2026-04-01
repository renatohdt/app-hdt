import Link from "next/link";
import { Card, Container, PageShell } from "@/components/ui";

const sections = [
  {
    title: "Quais dados coletamos",
    items: [
      "Dados de cadastro, como nome e e-mail.",
      "Respostas do onboarding e do quiz para personalizar treinos.",
      "Dados gerais de treino e rotina, como idade, peso, altura, dias disponiveis, tempo por sessao e equipamentos.",
      "Dados de uso e consentimentos sobre analytics, anuncios e marketing, quando autorizados."
    ]
  },
  {
    title: "Para que usamos esses dados",
    items: [
      "Criar, salvar e atualizar sua conta dentro do app.",
      "Gerar treinos sugeridos com base nas respostas fornecidas.",
      "Melhorar a experiencia do produto e operar comunicacoes opcionais, quando voce permite."
    ]
  },
  {
    title: "Como funciona a sugestao de treino",
    items: [
      "O treino e sugerido com base nas respostas fornecidas e deve ser utilizado como uma opcao de referencia.",
      "A logica considera informacoes gerais de treino, como objetivo, nivel, frequencia, disponibilidade e preferencias.",
      "O app usa apenas respostas gerais de treino para esse fluxo."
    ]
  },
  {
    title: "Terceiros e integracoes",
    items: [
      "Usamos servicos de infraestrutura, autenticacao, banco de dados e geracao assistida por IA para viabilizar o produto.",
      "Podemos usar integracoes opcionais de analytics, anuncios, pixel e automacao de marketing somente conforme seus consentimentos.",
      "Esses servicos atuam para viabilizar o funcionamento do produto ou comunicacoes autorizadas."
    ]
  },
  {
    title: "Cookies, tracking e preferencias",
    items: [
      "Analytics, anuncios e marketing sao tratados como categorias opcionais.",
      "Voce pode aceitar, recusar ou revisar essas escolhas no banner de consentimento e na central de privacidade.",
      "A revogacao vale para novas execucoes do app e futuras coletas."
    ]
  },
  {
    title: "Retencao e direitos do titular",
    items: [
      "Mantemos os dados enquanto a conta estiver ativa ou pelo tempo necessario para seguranca, operacao e obrigacoes aplicaveis.",
      "Voce pode acessar a central de privacidade para exportar dados, revisar consentimentos e solicitar exclusao da conta.",
      "Ao excluir a conta, apagaremos seus dados de acesso, respostas do quiz, treinos e historico interno, salvo o que precisarmos manter por obrigacao legal ou seguranca."
    ]
  }
];

export default function PoliticaDePrivacidadePage() {
  return (
    <PageShell>
      <Container className="max-w-4xl space-y-5 py-6">
        <Card className="space-y-4">
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Privacidade</p>
          <h1 className="text-3xl font-semibold text-white">Politica de privacidade</h1>
          <p className="text-sm leading-6 text-white/66">
            Esta politica resume, em linguagem simples, como o Hora do Treino coleta, usa e protege seus dados para operar a conta, gerar sugestoes de treino e cumprir solicitacoes de privacidade.
          </p>
        </Card>

        {sections.map((section) => (
          <Card key={section.title} className="space-y-4">
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <div className="space-y-3 text-sm leading-6 text-white/72">
              {section.items.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </Card>
        ))}

        <Card className="space-y-4">
          <h2 className="text-xl font-semibold text-white">Canal de privacidade</h2>
          <p className="text-sm leading-6 text-white/72">
            Para exercer direitos, registrar duvidas ou reportar questoes de privacidade, use a central autenticada em{" "}
            <Link href="/privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
              /privacidade
            </Link>{" "}
            ou envie um pedido para{" "}
            <a href="mailto:contato@horadotreino.com.br" className="font-semibold text-primary transition hover:text-primaryStrong">
              contato@horadotreino.com.br
            </a>
            .
          </p>
        </Card>
      </Container>
    </PageShell>
  );
}
