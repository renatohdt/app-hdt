const DEFAULT_SITE_URL = "https://app.horadotreino.com.br";

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!configuredUrl) {
    return DEFAULT_SITE_URL;
  }

  return configuredUrl.replace(/\/+$/, "") || DEFAULT_SITE_URL;
}

