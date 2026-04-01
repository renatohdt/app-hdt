import { Card, Container, PageShell } from "@/components/ui";
import { TERMS_OF_USE_UPDATED_LABEL } from "@/lib/legal-content";

const sections = [
  {
    title: "1. Objeto",
    paragraphs: [
      "Os presentes Termos de Uso regulam o acesso e a utilização do Hora do Treino, plataforma digital que apresenta sugestões automatizadas de treino com base nas informações fornecidas pelo próprio usuário.",
      "Ao utilizar o app, você declara que leu, compreendeu e concorda com estes Termos."
    ]
  },
  {
    title: "2. Natureza do serviço",
    paragraphs: [
      "O Hora do Treino fornece conteúdo informativo e sugestões automatizadas de treino para fins de apoio e referência.",
      "O conteúdo disponibilizado não substitui avaliação individual, prescrição técnica, acompanhamento profissional ou orientação presencial de profissional de educação física, médico ou outro especialista habilitado."
    ]
  },
  {
    title: "3. Responsabilidade do usuário",
    paragraphs: [
      "Você é responsável pela veracidade, atualização e adequação das informações inseridas no app.",
      "Antes de iniciar ou alterar sua rotina de exercícios, avalie suas condições pessoais e, quando necessário, procure orientação profissional adequada.",
      "Ao utilizar o conteúdo do app, você se compromete a respeitar seus limites físicos e a interromper a prática em caso de desconforto relevante, mal-estar ou qualquer sinal de risco."
    ]
  },
  {
    title: "4. Riscos da atividade física",
    paragraphs: [
      "A prática de exercícios físicos envolve riscos inerentes, inclusive fadiga, desconforto, lesões e outros eventos adversos.",
      "Ao continuar no app, você reconhece esses riscos e declara que utilizará as sugestões com prudência, dentro da sua realidade e sob sua própria responsabilidade."
    ]
  },
  {
    title: "5. Elegibilidade e uso adequado",
    paragraphs: [
      "O usuário deve utilizar o app de forma lícita, ética e compatível com sua finalidade.",
      "É proibido usar o Hora do Treino para violar direitos de terceiros, tentar acessar áreas restritas, comprometer a segurança da plataforma ou explorar o serviço de forma abusiva."
    ]
  },
  {
    title: "6. Conta de acesso",
    paragraphs: [
      "Algumas funcionalidades dependem de criação de conta. Você é responsável por manter a confidencialidade das suas credenciais e por toda atividade realizada na sua conta.",
      "O app poderá adotar medidas de segurança, bloqueio ou encerramento de acesso em caso de uso irregular, suspeita de fraude ou violação destes Termos."
    ]
  },
  {
    title: "7. Limitação de responsabilidade",
    paragraphs: [
      "O Hora do Treino não garante resultado específico, desempenho físico, segurança absoluta, adequação integral do conteúdo a qualquer caso concreto ou ausência de falhas.",
      "Dentro dos limites legais aplicáveis, o app não se responsabiliza por decisões tomadas pelo usuário com base nas sugestões apresentadas, nem por danos decorrentes de uso inadequado, interpretação incorreta, omissão de informações relevantes ou desrespeito aos próprios limites."
    ]
  },
  {
    title: "8. Disponibilidade e mudanças",
    paragraphs: [
      "O serviço pode ser alterado, atualizado, interrompido ou descontinuado, no todo ou em parte, a qualquer momento, por razões técnicas, operacionais, legais ou estratégicas.",
      "Também poderemos revisar estes Termos periodicamente. A versão vigente ficará disponível nesta página."
    ]
  },
  {
    title: "9. Propriedade intelectual",
    paragraphs: [
      "Os textos, marcas, interfaces, elementos visuais, estrutura do produto e demais conteúdos do Hora do Treino são protegidos pela legislação aplicável.",
      "É vedada a reprodução, distribuição, modificação ou exploração do conteúdo sem autorização, exceto quando expressamente permitido por lei."
    ]
  },
  {
    title: "10. Privacidade e dados",
    paragraphs: [
      "O tratamento de dados pessoais relacionado ao uso do app segue a Política de Privacidade disponível na plataforma.",
      "Ao utilizar o serviço, você reconhece que determinados registros operacionais e eventos de uso podem ser armazenados para fins de funcionamento, segurança, auditoria e cumprimento de obrigações."
    ]
  },
  {
    title: "11. Legislação aplicável",
    paragraphs: [
      "Estes Termos serão interpretados conforme a legislação brasileira.",
      "Sempre que permitido, fica eleito o foro da comarca do titular do serviço ou outro foro competente nos termos da lei aplicável."
    ]
  },
  {
    title: "12. Contato",
    paragraphs: [
      "Em caso de dúvidas sobre estes Termos de Uso, entre em contato pelo canal informado no app ou pelo e-mail contato@horadotreino.com.br."
    ]
  }
] as const;

export default function TermosDeUsoPage() {
  return (
    <PageShell>
      <Container className="max-w-4xl space-y-5 py-6">
        <Card className="space-y-4">
          <p className="text-sm uppercase tracking-[0.24em] text-primary">Legal</p>
          <h1 className="text-3xl font-semibold text-white">Termos de Uso</h1>
          <p className="text-sm text-white/60">Última atualização: {TERMS_OF_USE_UPDATED_LABEL}</p>
          <p className="text-sm leading-6 text-white/70">
            Estes Termos descrevem as condições de uso do Hora do Treino e têm foco em transparência, uso responsável e redução de risco na utilização do conteúdo apresentado pelo app.
          </p>
        </Card>

        {sections.map((section) => (
          <Card key={section.title} className="space-y-4">
            <h2 className="text-xl font-semibold text-white">{section.title}</h2>
            <div className="space-y-3 text-sm leading-6 text-white/72">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </Card>
        ))}
      </Container>
    </PageShell>
  );
}
