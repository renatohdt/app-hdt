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

// Garante que uma promessa não trave a tela pra sempre: se passar do tempo,
// rejeita para o fluxo seguir em frente.
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
  ]);
}

let configured = false;

// Configura o RevenueCat e identifica o usuário (app_user_id = id do Supabase).
// Assim o webhook sabe de quem é a compra.
// Tem tempo-limite: se a chamada nativa travar, não deixa a tela presa em "Carregando".
export async function configureRevenueCat(appUserId: string): Promise<boolean> {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  if (!apiKey) return false;

  try {
    const Purchases = await withTimeout(getPurchases(), 8000, "timeout_import");
    if (!configured) {
      await withTimeout(Purchases.configure({ apiKey, appUserID: appUserId }), 8000, "timeout_configure");
      configured = true;
    } else {
      await withTimeout(Purchases.logIn({ appUserID: appUserId }), 8000, "timeout_login");
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
    // getOfferings pode travar se os produtos não estiverem disponíveis na
    // App Store ainda. Limite de 12s pra não deixar a tela presa em "Carregando".
    const offerings = await Promise.race([
      Purchases.getOfferings(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout_offerings")), 12000)),
    ]);
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

// DIAGNÓSTICO TEMPORÁRIO — revela por que os planos não carregam.
// Chama getOfferings E getProducts (sem timeout artificial) e devolve tudo
// numa string curta pra mostrar na tela. Remover depois de resolver.
export async function diagnoseRevenueCat(
  appUserId: string | null,
  onStep?: (s: string) => void
): Promise<string> {
  const apiKey = process.env.NEXT_PUBLIC_REVENUECAT_IOS_KEY;
  const parts: string[] = [];
  const push = (s: string) => {
    parts.push(s);
    try {
      onStep?.(parts.join(" | "));
    } catch {
      /* ignore */
    }
  };
  const errText = (e: unknown) => {
    const err = e as { code?: string; message?: string };
    return `${err?.code ?? ""}:${err?.message ?? String(e)}`;
  };

  push(`key=${apiKey ? apiKey.slice(0, 10) + "…" : "FALTANDO"}`);
  push(`uid=${appUserId ? "sim" : "nao"}`);

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Purchases: any = await withTimeout(getPurchases(), 15000, "TIMEOUT_import");
    push("sdk=ok");

    try {
      if (!configured) {
        await withTimeout(
          Purchases.configure(appUserId ? { apiKey, appUserID: appUserId } : { apiKey }),
          20000,
          "TIMEOUT"
        );
        configured = true;
      } else if (appUserId) {
        await withTimeout(Purchases.logIn({ appUserID: appUserId }), 20000, "TIMEOUT");
      }
      push("configure=ok");
    } catch (e) {
      push(`configure ERRO=${errText(e)}`);
    }

    push("chamando getOfferings...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const offs: any = await withTimeout(Purchases.getOfferings(), 20000, "TIMEOUT");
      push(
        `offerings.all=[${Object.keys(offs?.all ?? {}).join(",")}] current=${
          offs?.current?.identifier ?? "NULL"
        } pkgs=${offs?.current?.availablePackages?.length ?? 0}`
      );
    } catch (e) {
      push(`getOfferings ERRO=${errText(e)}`);
    }

    push("chamando getProducts...");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res: any = await withTimeout(
        Purchases.getProducts({
          productIdentifiers: [
            "com.horadotreino.premium.monthly",
            "com.horadotreino.premium.annual",
          ],
        }),
        20000,
        "TIMEOUT"
      );
      const prods = res?.products ?? res ?? [];
      const ids = Array.isArray(prods) ? prods.map((p: { identifier?: string }) => p.identifier).join(",") : "";
      push(`getProducts=${Array.isArray(prods) ? prods.length : 0} [${ids}]`);
    } catch (e) {
      push(`getProducts ERRO=${errText(e)}`);
    }
  } catch (e) {
    push(`sdk ERRO=${errText(e)}`);
  }

  return parts.join(" | ");
}
