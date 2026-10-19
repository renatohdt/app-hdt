// Converte o link que veio numa notificação (push ou local) em um caminho
// INTERNO do app, seguro para navegar. Aceita "/perfil" ou o endereço completo
// do próprio app ("https://app.horadotreino.com.br/perfil"). Qualquer outra
// coisa (outro site, "//site.com", "javascript:") é ignorada → volta null.

const APP_HOSTS = ["app.horadotreino.com.br"];

export function toSafeInternalPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value) return null;

  // Caminho relativo do próprio app: "/algo" (mas não "//outro-site.com")
  if (value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\")) {
    return value;
  }

  // Endereço completo: só aceita se for do próprio app.
  try {
    const url = new URL(value);
    const sameOrigin = typeof window !== "undefined" && url.origin === window.location.origin;
    if (url.protocol === "https:" && (sameOrigin || APP_HOSTS.includes(url.hostname))) {
      return `${url.pathname}${url.search}${url.hash}` || "/";
    }
  } catch {
    // não é um endereço válido
  }
  return null;
}
