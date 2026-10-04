// Preços do Premium e cálculo do "preço por dia".
// Web (Stripe): valores fixos abaixo. App nativo (Apple/Google): o preço vem da
// loja (priceString do RevenueCat) e é convertido aqui.
// Regra da Apple (3.1.2): o valor cobrado (mensal/anual) precisa continuar claro
// e em destaque; o "por dia" é só uma referência ao lado dele.

export type PremiumPeriod = "monthly" | "annual";

export const WEB_PREMIUM_PRICES: Record<PremiumPeriod, number> = {
  monthly: 14.9,
  annual: 118.8
};

const DAYS_IN_PERIOD: Record<PremiumPeriod, number> = {
  monthly: 30,
  annual: 365
};

// Arredonda para CIMA no centavo: nunca anunciamos um valor menor que o real.
export function getPricePerDay(amount: number, period: PremiumPeriod) {
  return Math.ceil((amount / DAYS_IN_PERIOD[period]) * 100) / 100;
}

export function formatBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "R$ 0,33" para os preços da web.
export function getWebPricePerDayLabel(period: PremiumPeriod) {
  return formatBRL(getPricePerDay(WEB_PREMIUM_PRICES[period], period));
}

// Converte o texto de preço da loja ("R$ 119,90", "$9.99") em número.
export function parseStorePrice(priceString: string | null | undefined): number | null {
  if (!priceString) return null;
  const cleaned = priceString.replace(/[^\d.,]/g, "");
  if (!cleaned) return null;
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  // O separador decimal é o último que aparece; o outro é de milhar.
  const decimalSep = lastComma > lastDot ? "," : ".";
  const thousandSep = decimalSep === "," ? "." : ",";
  const normalized = cleaned.split(thousandSep).join("").replace(decimalSep, ".");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Preço por dia a partir do texto da loja, mantendo o símbolo de moeda dela.
export function getStorePricePerDayLabel(priceString: string | null | undefined, period: PremiumPeriod) {
  const amount = parseStorePrice(priceString);
  if (amount === null || !priceString) return null;
  const perDay = getPricePerDay(amount, period);
  const symbol = priceString.replace(/[\d.,\s]/g, "").trim() || "R$";
  return `${symbol} ${perDay.toFixed(2).replace(".", symbol.includes("R$") ? "," : ".")}`;
}
