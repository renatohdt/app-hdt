import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  // Identificador permanente do app (o "CPF do app"). NÃO mudar depois de publicado.
  appId: "com.horadotreino.app",

  // Nome que aparece embaixo do ícone no celular.
  appName: "Hora do Treino",

  // Pasta de arquivos web locais exigida pelo Capacitor.
  // Como usamos "server.url" abaixo, o app carrega o site ao vivo e esta pasta
  // fica só como exigência técnica (não é o que roda de fato).
  webDir: "public",

  // Faz o app carregar o site em produção em tempo real.
  // Resultado: você atualiza no Vercel e reflete no app, sem reenviar pra loja.
  server: {
    url: "https://app.horadotreino.com.br",
    cleartext: false,
  },

  // Marca a identidade do app (user agent) para o site conseguir detectar
  // que está rodando dentro do app e esconder o checkout do Stripe.
  android: {
    appendUserAgent: "HoraDoTreinoApp",
  },
  ios: {
    appendUserAgent: "HoraDoTreinoApp",
  },
};

export default config;
