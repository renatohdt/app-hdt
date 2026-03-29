export type ArticleSeed = {
  slug: string;
  tags: string[];
};

export type ArticleRecommendation = {
  title: string;
  url: string;
  image: string;
  tags: string[];
  author: string;
  readingTime: number;
};

export function capitalize(text: string) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export const ARTICLE_PLACEHOLDER_IMAGE =
  "https://horadotreino.com.br/wp-content/uploads/2026/03/logo-branco.png";

export const BLOG_ARTICLE_SEEDS: ArticleSeed[] = [
  {
    slug: "4-dicas-de-como-perder-barriga",
    tags: ["emagrecimento", "casa", "iniciante", "evergreen"]
  },
  {
    slug: "como-ganhar-massa-muscular-treinando-em-casa",
    tags: ["hipertrofia", "casa", "intermediario", "evergreen"]
  },
  {
    slug: "definicao-muscular-o-que-ajustar-no-treino-e-na-dieta",
    tags: ["definicao", "casa", "intermediario", "evergreen"]
  },
  {
    slug: "condicionamento-fisico-por-onde-comecar",
    tags: ["condicionamento", "casa", "iniciante", "evergreen"]
  },
  {
    slug: "treino-para-iniciantes-em-casa",
    tags: ["popular", "casa", "iniciante", "evergreen"]
  }
];

export function mapGoalToArticleTag(goal?: string) {
  const labels: Record<string, string> = {
    lose_weight: "emagrecimento",
    gain_muscle: "hipertrofia",
    body_recomposition: "definicao",
    improve_conditioning: "condicionamento"
  };

  return goal ? labels[goal] ?? "" : "";
}

export function mapLevelToArticleTag(level?: string) {
  const labels: Record<string, string> = {
    no_training: "iniciante",
    lt_6_months: "iniciante",
    "6_to_12_months": "intermediario",
    gt_1_year: "avancado"
  };

  return level ? labels[level] ?? "" : "";
}

export function getEvergreenFallbackArticles() {
  return BLOG_ARTICLE_SEEDS.map((seed) => ({
    title: capitalize(seed.slug.replaceAll("-", " ")),
    url: `https://horadotreino.com.br/${seed.slug}/`,
    image: ARTICLE_PLACEHOLDER_IMAGE,
    tags: seed.tags,
    author: "Hora do Treino",
    readingTime: 3
  }));
}

export function dedupeArticles(articles: ArticleRecommendation[]) {
  return articles.filter((article, index, array) => array.findIndex((item) => item.url === article.url) === index);
}
