/**
 * SchemaOrg — dados estruturados JSON-LD para SEO
 *
 * Este é um Server Component (sem "use client"), então o Google recebe
 * o conteúdo diretamente no HTML, sem precisar executar JavaScript.
 *
 * Schemas implementados:
 *  - SoftwareApplication: identifica o app para o Google (categoria, preço, etc.)
 *  - Organization: identifica a marca e seus perfis sociais
 *  - FAQPage: marca as perguntas frequentes da homepage para rich results
 */

const SITE_URL = "https://app.horadotreino.com.br";

const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Hora do Treino",
  url: SITE_URL,
  applicationCategory: "HealthAndFitnessApplication",
  operatingSystem: "Web, Android, iOS",
  description:
    "Treino personalizado online com método de personal trainer e montado por IA. Crie seu plano de treino em casa grátis.",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "BRL",
  },
  inLanguage: "pt-BR",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Hora do Treino",
  url: SITE_URL,
  logo: `${SITE_URL}/pwa/icon-512x512.png`,
  sameAs: [
    "https://www.instagram.com/horadotreino",
  ],
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Preciso de equipamentos para treinar em casa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Não! O app cria treinos 100% adaptados ao que você tem disponível. Pode ser sem nenhum equipamento, apenas com seu corpo, ou utilizando o que você já tem em casa.",
      },
    },
    {
      "@type": "Question",
      name: "O app de treino é realmente gratuito?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim! Você pode criar seu treino personalizado e começar a treinar em casa completamente grátis. O plano Premium oferece funcionalidades avançadas para quem quer ir mais fundo na evolução.",
      },
    },
    {
      "@type": "Question",
      name: "Funciona para iniciantes em exercícios em casa?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Com certeza. O app pergunta seu nível de condicionamento e monta um treino adequado para você. Iniciantes recebem planos progressivos, seguros e eficazes.",
      },
    },
    {
      "@type": "Question",
      name: "Consigo resultado treinando em casa sem academia?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Sim! Com um treino bem estruturado e consistência, o treino em casa pode ser tão eficaz quanto a academia. O segredo está em seguir um plano pensado para você — e é exatamente isso que o Hora do Treino faz.",
      },
    },
    {
      "@type": "Question",
      name: "Quanto tempo por dia preciso treinar?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Você informa quanto tempo tem disponível e o app adapta o treino a isso. Você pode treinar de 20 a 60 minutos — o que couber na sua rotina.",
      },
    },
  ],
};

export function SchemaOrg() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
