import Link from "next/link";
import { Card, Container, PageShell } from "@/components/ui";

const sections = [
  {
    title: "Quais dados coletamos",
    items: [
      "Dados de cadastro, como nome e e-mail.",
      "Respostas do onboarding e do quiz para personalizar treinos.",
      "Dados gerais de treino e rotina, como idade, peso, altura, dias disponíveis, tempo por sessão e equipamentos.",
      "Dados de uso do app e consentimentos sobre anúncios e marketing, quando autorizados."
    ]
  },
  {
    title: "Para que usamos esses dados",
    items: [
      "Criar, salvar e atualizar sua conta dentro do app.",
      "Gerar treinos sugeridos com base nas respostas fornecidas.",
      "Melhorar a experiência do produto e operar comunicações opcionais, quando você permite."
    ]
  },
  {
    title: "Como funciona a sugestão de treino",
    items: [
      "O treino é sugerido com base nas respostas fornecidas e deve ser utilizado como uma opção de referência.",
      "A lógica considera informações gerais de treino, como objetivo, nível, frequência, disponibilidade e preferências.",
      "O app usa apenas respostas gerais de treino para esse fluxo."
    ]
  },
  {
    title: "Terceiros e integrações",
    items: [
      "Usamos serviços de infraestrutura, autenticação, banco de dados e geração assistida por IA para viabilizar o produto.",
      "Podemos usar analytics para medir o uso do produto e integrações opcionais de anúncios, pixel e automação de marketing conforme seus consentimentos.",
      "Esses serviços atuam para viabilizar o funcionamento do produto ou comunicações autorizadas."
    ]
  },
  {
    title: "Cookies, tracking e preferências",
    items: [
      "Anúncios e marketing são tratados como categorias opcionais.",
      "Você pode aceitar, recusar ou revisar essas escolhas no banner de consentimento e na central de privacidade.",
      "A revogação vale para novas execuções do app e futuras coletas."
    ]
  },
  {
    title: "Retenção e direitos do titular",
    items: [
      "Mantemos os dados enquanto a conta estiver ativa ou pelo tempo necessário para segurança, operação e obrigações aplicáveis.",
      "Você pode acessar a central de privacidade para exportar dados, revisar consentimentos e solicitar exclusão da conta.",
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
            Esta política resume, em linguagem simples, como o Hora do Treino coleta, usa e protege seus dados para operar a conta, gerar sugestões de treino e cumprir solicitações de privacidade.
          </p>
        </Card>

        <Card className="space-y-4 border-primary/20 bg-primary/10">
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Central de Privacidade</p>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-2xl text-sm leading-6 text-white/72">
              Acesse a área autenticada para exportar seus dados, revisar consentimentos e solicitar a exclusão da conta.
            </p>
            <Link
              href="/privacidade"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-primary/30 bg-white/5 px-5 py-3 text-sm font-semibold text-primary transition hover:border-primaryStrong hover:bg-white/10 hover:text-white"
            >
              Abrir Central de Privacidade
            </Link>
          </div>
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
