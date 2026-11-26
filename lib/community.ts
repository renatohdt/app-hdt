// Comunidade do Hora do Treino no WhatsApp (nov/2026).
//
// O app NUNCA abre o convite do WhatsApp direto: ele abre o link curto abaixo,
// e a rota app/comunidade/route.ts redireciona para o convite.
// Assim, se o convite mudar (ex.: link vazou e foi redefinido), basta trocar
// em app/comunidade/route.ts e publicar na Vercel — sem versão nova nas lojas.
//
// O link é absoluto de propósito: dentro do app (Capacitor) um link externo
// com target="_blank" abre no navegador/WhatsApp do sistema.
export const COMMUNITY_URL = "https://app.horadotreino.com.br/comunidade";
