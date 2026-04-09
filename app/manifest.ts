import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hora do Treino",
    short_name: "Hora do Treino",
    description: "App mobile para acompanhar e executar seu plano de treino",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#040504",
    theme_color: "#050705",
    lang: "pt-BR",
    categories: ["fitness", "lifestyle", "sports"],
    icons: [
      { src: "/pwa/icon-72x72.png", sizes: "72x72", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-96x96.png", sizes: "96x96", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-128x128.png", sizes: "128x128", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-144x144.png", sizes: "144x144", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-152x152.png", sizes: "152x152", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-384x384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-192x192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa/icon-512x512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
