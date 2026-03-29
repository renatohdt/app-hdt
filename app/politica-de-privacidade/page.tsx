import Link from "next/link";
import { Card, Container, PageShell } from "@/components/ui";

const sections = [
  {
    title: "Quais dados coletamos",
    items: [
      "Dados de cadastro, como nome e e-mail.",
      "Respostas do onboarding e do quiz para personalizar treinos.",
      "Dados físicos e de rotina, como idade, peso, altura, dias disponíveis e equipamentos.",
      "Informações opcionais sobre dores, lesões e limitações físicas, tratadas como dados sensíveis.",
      "Dados de uso e consentimentos sobre analytics, anúncios e marketing, quando autorizados."
    ]
  },
  {
    title: "Para que usamos esses dados",
    items: [
      "Criar, salvar e atualizar sua conta dentro do app.",
      "Gerar treinos personalizados e acompanhar sua evolução no produto.",
      "Evitar recomendações inadequadas quando você informa limitações físicas.",
      "Medir uso do produto, melhorar a experiência e operar comunicações opcionais, quando você permite."
    ]
  },
  {
    title: "Dados sensíveis e geração com IA",
    items: [
      "Dores, lesões e limitações físicas são opcionais e recebem tratamento mais restrito.",
      "Seu treino é gerado com apoio de inteligência artificial a partir das respostas do formulário.",
      "Você pode solicitar revisão humana ou contestar a recomendação na central de privacidade."
    ]
  },
  {
    title: "Terceiros e integrações",
    items: [
      "Usamos serviços de infraestrutura, autenticação, banco de dados e geração assistida por IA.",
      "Podemos usar integrações opcionais de analytics, anúncios, pixel e automação de marketing somente conforme seus consentimentos.",
      "Esses serviços atuam para viabilizar o funcionamento do produto ou comunicações autorizadas."
    ]
  },
  {
    title: "Cookies, tracking e preferências",
    items: [
      "Analytics, anúncios e marketing são tratados como categorias opcionais.",
      "Você pode aceitar, recusar ou revisar essas escolhas no banner de consentimento e na central de privacidade.",
      "A revogação vale para novas execuções do app e futuras coletas."
    ]
  },
  {
    title: "Retenção e direitos do titular",
    items: [
      "Mantemos os dados enquanto a conta estiver ativa ou pelo tempo necessário para segurança, operação e obrigações aplicáveis.",
      "Você pode acessar a central de privacidade para exportar dados, revogar consentimentos, pedir revisão humana e solicitar exclusão da conta.",
      "Ao excluir a conta, apagaremos seus dados de acesso, respostas do quiz, treinos e histórico interno, salvo o que precisarmos manter por obrigação legal ou segurança."
    ]
  }
];

export default function PoliticaDePrivacidadePage() {
  return (
    <PageShell>
      <Container className="max-w-4xl space-y-5 py-6">
        <Card className="space-y-4">
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Privacidade</p>
          <h1 className="text-3xl font-semibold text-white">Política de privacidade</h1>
          <p className="text-sm leading-6 text-white/66">
            Esta política resume, em linguagem simples, como o Hora do Treino coleta, usa e protege seus dados para operar a conta, gerar treinos personalizados e cumprir solicitações de privacidade.
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
            Para exercer direitos, registrar dúvidas ou reportar questões de privacidade, use a central autenticada em{" "}
            <Link href="/privacidade" className="font-semibold text-primary transition hover:text-primaryStrong">
              /privacidade
            </Link>{" "}
            ou envie um pedido para{" "}
            <a href="mailto:privacidade@horadotreino.com.br" className="font-semibold text-primary transition hover:text-primaryStrong">
              privacidade@horadotreino.com.br
            </a>
            .
          </p>
        </Card>
      </Container>
    </PageShell>
  );
}
