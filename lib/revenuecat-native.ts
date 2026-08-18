"use client";

// Wrapper do RevenueCat para o app iOS. Só é chamado DENTRO do app nativo.
// Usa import dinâmico: o pacote só carrega quando as funções são chamadas
// (e só chamamos no iOS), então o build web não quebra nem fica pesado.

// Precisa ser IGUAL ao identifier do Entitlement no painel do RevenueCat.
export const PREMIUM_ENTITLEMENT_ID = "Hora do Treino Premium";

export type RcPackage = {
  identifier: string;
  packageType: string;
  product: { identifier: string; priceString: string; title?: string };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPurchases(): Promise<any> {
  const mod = await import("@revenuecat/purchases-capacitor");
  return mod.Purchases;
}

let configured = false;

// Configura o RevenueCat e identifica o usuário (app_user_id = id do Supabase).
// Assim o webhook sabe de quem é a compra.
export async function configureRevenueCat(appUserId: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  if (!apiKey) return false;

  try {
    const Purchases = await getPurchases();
    if (!configured) {
      await Purchases.configure({ apiKey, appUserID: appUserId });
      configured = true;
    } else {
      await Purchases.logIn({ appUserID: appUserId });
    }
    return true;
  } catch {
    return false;
  }
}

// Busca os pacotes (mensal/anual) da oferta atual configurada no RevenueCat.
export async function getPremiumPackages(): Promise<{ monthly?: RcPackage; annual?: RcPackage }> {
  try {
    const Purchases = await getPurchases();
    const offerings = await Purchases.getOfferings();
    const pkgs = offerings?.current?.availablePackages ?? [];
    const result: { monthly?: RcPackage; annual?: RcPackage } = {};

    for (const p of pkgs) {
      const type = String(p?.packageType ?? "").toUpperCase();
      if (type === "MONTHLY") result.monthly = p as RcPackage;
      if (type === "ANNUAL") result.annual = p as RcPackage;
    }
    return result;
  } catch {
    return {};
  }
}

// Compra um pacote. Retorna { ok } se o premium ficou ativo, ou { canceled }
// se o usuário fechou o pop-up da Apple.
export async function purchasePremium(
  pkg: RcPackage
): Promise<{ ok: boolean; canceled?: boolean; error?: string }> {
  try {
    const Purchases = await getPurchases();
    const res = await Purchases.purchasePackage({ aPackage: pkg });
    const active = Boolean(res?.customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID]);
    return { ok: active };
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string; userCancelled?: boolean };
    if (err?.userCancelled || err?.code === "1" || /cancel/i.test(err?.message ?? "")) {
      return { ok: false, canceled: true };
    }
    return { ok: false, error: err?.message ?? "purchase_failed" };
  }
}

// Restaura compras anteriores (a Apple EXIGE esse botão).
export async function restorePremium(): Promise<{ ok: boolean }> {
  try {
    const Purchases = await getPurchases();
    const res = await Purchases.restorePurchases();
    const active = Boolean(res?.customerInfo?.entitlements?.active?.[PREMIUM_ENTITLEMENT_ID]);
    return { ok: active };
  } catch {
    return { ok: false };
  }
}
