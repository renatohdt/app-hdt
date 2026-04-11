import type { MetadataRoute } from "next";

type SitemapChangeFrequency = NonNullable<MetadataRoute.Sitemap[number]["changeFrequency"]>;

export type PublicSitemapRoute = {
  pathname: string;
  changeFrequency: SitemapChangeFrequency;
  priority: number;
};

export const INDEXABLE_ROUTES: PublicSitemapRoute[] = [
  {
    pathname: "/",
    changeFrequency: "weekly",
    priority: 1
  },
  {
    pathname: "/politica-de-privacidade",
    changeFrequency: "monthly",
    priority: 0.6
  },
  {
    pathname: "/termos-de-uso",
    changeFrequency: "monthly",
    priority: 0.6
  }
];

export const ROBOTS_DISALLOW_PATHS = [
  "/admin",
  "/api",
  "/dashboard",
  "/login",
  "/perfil",
  "/privacidade",
  "/progresso",
  "/results",
  "/treino",
  "/calendario"
] as const;
