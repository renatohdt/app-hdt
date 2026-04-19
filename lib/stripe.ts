import "server-only";

import Stripe from "stripe";

// Garante que a chave secreta está configurada antes de instanciar
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error("STRIPE_SECRET_KEY não está configurada nas variáveis de ambiente.");
}

// Instância singleton do cliente Stripe
// apiVersion fixada para garantir comportamento estável mesmo que o Stripe atualize a API
export const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2026-03-25.dahlia",
  typescript: true,
});

// IDs dos preços cadastrados no Stripe
// Esses valores são preenchidos via variáveis de ambiente por segurança
export const STRIPE_PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY ?? "",
  annual: process.env.STRIPE_PRICE_ID_ANNUAL ?? "",
} as const;

export type PlanType = keyof typeof STRIPE_PRICE_IDS;
