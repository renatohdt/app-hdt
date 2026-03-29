import "server-only";
import {
  ARTICLE_PLACEHOLDER_IMAGE,
  capitalize,
  dedupeArticles,
  getEvergreenFallbackArticles,
  mapGoalToArticleTag,
  mapLevelToArticleTag,
  type ArticleRecommendation
} from "@/lib/articles";
import type { QuizAnswers } from "@/lib/types";

const WORDPRESS_BASE = "https://horadotreino.com.br/wp-json/wp/v2/posts";
const RECOMMENDATION_LIMIT = 3;
const RECOMMENDATION_TTL_MS = 24 * 60 * 60 * 1000;
const RECENT_AVOID_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type WordPressPost = {
  id: number;
  title?: { rendered?: string };
  link?: string;
  slug?: string;
  content?: { rendered?: string };
  _embedded?: {
    "wp:featuredmedia"?: Array<{
      media_details?: {
        sizes?: {
          medium?: {
            source_url?: string;
          };
        };
      };
      source_url?: string;
    }>;
    author?: Array<{
      name?: string;
    }>;
  };
};

type SupabaseAdminLike = any;

export async function getOrCreateContentRecommendations(
  supabase: SupabaseAdminLike,
  userId: string,
  answers: Partial<QuizAnswers> | null | undefined
) {
  const current = await getStoredRecommendation(supabase, userId);

  if (current && current.expiresAt > Date.now() && current.articles.length) {
    return current.articles;
  }

  const clickedUrls = await getClickedArticleUrls(supabase, userId);
  const recentlyShownUrls = await getRecentlyShownArticleUrls(supabase, userId);
  const generated = await buildRecommendations({
    goal: answers?.goal,
    location: answers?.location,
    level: answers?.experience,
    clickedUrls,
    recentlyShownUrls
  });

  const now = Date.now();
  const expiresAt = now + RECOMMENDATION_TTL_MS;

  await saveRecommendation(supabase, userId, generated, now, expiresAt);
  await saveRecommendationHistory(supabase, userId, generated, answers);

  return generated;
}

async function getStoredRecommendation(supabase: SupabaseAdminLike, userId: string) {
  const { data, error } = await supabase
    .from("content_recommendations")
    .select("articles, generated_at, expires_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const articles = Array.isArray(data.articles) ? (data.articles as ArticleRecommendation[]) : [];
  const generatedAt = data.generated_at ? new Date(data.generated_at).getTime() : 0;
  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;

  return {
    articles,
    generatedAt,
    expiresAt
  };
}

async function getClickedArticleUrls(supabase: SupabaseAdminLike, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("metadata, created_at")
    .gte("created_at", new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString())
    .eq("user_id", userId)
    .eq("event_name", "article_click")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return new Set<string>();
  }

  const rows = data as Array<{ metadata?: { url?: unknown } }>;

  return new Set<string>(
    rows
      .map((item) => (typeof item.metadata?.url === "string" ? item.metadata.url : ""))
      .filter((url): url is string => Boolean(url))
  );
}

async function getRecentlyShownArticleUrls(supabase: SupabaseAdminLike, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("analytics_events")
    .select("metadata, created_at")
    .gte("created_at", new Date(Date.now() - RECENT_AVOID_WINDOW_MS).toISOString())
    .eq("user_id", userId)
    .eq("event_name", "content_recommendation_generated")
    .order("created_at", { ascending: false });

  if (error || !data) {
    return new Set<string>();
  }

  const rows = data as Array<{ metadata?: { urls?: unknown } }>;
  const urls = new Set<string>();

  for (const item of rows) {
    const values = Array.isArray(item.metadata?.urls) ? item.metadata.urls : [];

    for (const value of values) {
      if (typeof value === "string" && value) {
        urls.add(value);
      }
    }
  }

  return urls;
}

async function buildRecommendations({
  goal,
  location,
  level,
  clickedUrls,
  recentlyShownUrls
}: {
  goal?: string;
  location?: string;
  level?: string;
  clickedUrls: Set<string>;
  recentlyShownUrls: Set<string>;
}) {
  const queryStages = buildSearchQueries(goal, location);
  const candidateBuckets: ArticleRecommendation[][] = [];

  for (const query of queryStages) {
    if (!query) continue;
    const posts = await getPostsBySearch(query);
    candidateBuckets.push(posts.map((post) => toArticleRecommendation(post, goal, location, level)));
  }

  candidateBuckets.push((await getLatestPosts()).map((post) => toArticleRecommendation(post, goal, location, level)));
  candidateBuckets.push(getEvergreenFallbackArticles());

  const candidatePool = dedupeArticles(candidateBuckets.flat());
  const primary = rankAndPickArticles(candidatePool, { goal, location, level, clickedUrls, recentlyShownUrls }, false);
  const finalSelection = primary.length >= 2
    ? primary
    : rankAndPickArticles(candidatePool, { goal, location, level, clickedUrls, recentlyShownUrls }, true);

  return finalSelection.slice(0, RECOMMENDATION_LIMIT);
}

function rankAndPickArticles(
  articles: ArticleRecommendation[],
  {
    goal,
    location,
    level,
    clickedUrls,
    recentlyShownUrls
  }: {
    goal?: string;
    location?: string;
    level?: string;
    clickedUrls: Set<string>;
    recentlyShownUrls: Set<string>;
  },
  allowRecentFallback: boolean
) {
  const goalTag = mapGoalToArticleTag(goal);
  const levelTag = mapLevelToArticleTag(level);
  const locationTag = location === "gym" ? "academia" : "casa";

  return articles
    .map((article) => {
      const normalizedTitle = article.title.toLowerCase();
      let score = 0;

      if (goalTag && article.tags.includes(goalTag)) score += 8;
      if (goalTag && normalizedTitle.includes(goalTag)) score += 4;
      if (locationTag && article.tags.includes(locationTag)) score += 3;
      if (levelTag && article.tags.includes(levelTag)) score += 1;
      if (article.tags.includes("evergreen")) score += 0.5;

      if (clickedUrls.has(article.url)) score -= 100;
      if (recentlyShownUrls.has(article.url)) score -= allowRecentFallback ? 3 : 20;

      return { article, score };
    })
    .filter((item) => item.score > (allowRecentFallback ? -10 : 0))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.article)
    .slice(0, RECOMMENDATION_LIMIT);
}

async function saveRecommendation(
  supabase: SupabaseAdminLike,
  userId: string,
  articles: ArticleRecommendation[],
  generatedAtMs: number,
  expiresAtMs: number
) {
  const payload = {
    user_id: userId,
    articles,
    generated_at: new Date(generatedAtMs).toISOString(),
    expires_at: new Date(expiresAtMs).toISOString(),
    updated_at: new Date(generatedAtMs).toISOString()
  };

  const existing = await getStoredRecommendation(supabase, userId);

  if (existing) {
    await supabase.from("content_recommendations").update(payload).eq("user_id", userId);
    return;
  }

  await supabase.from("content_recommendations").insert(payload);
}

async function saveRecommendationHistory(
  supabase: SupabaseAdminLike,
  userId: string,
  articles: ArticleRecommendation[],
  answers: Partial<QuizAnswers> | null | undefined
) {
  await supabase.from("analytics_events").insert({
    event_name: "content_recommendation_generated",
    user_id: userId,
    metadata: {
      urls: articles.map((article) => article.url),
      goal: answers?.goal ?? null,
      location: answers?.location ?? null
    }
  });
}

function buildSearchQueries(goal?: string, location?: string) {
  const baseGoalQuery = buildGoalQuery(goal);
  const locationQuery = buildLocationQuery(location);

  const primary = [baseGoalQuery, locationQuery, "treino", "dicas"].filter(Boolean).join(" ").trim();
  const secondary = [baseGoalQuery, "treino", "dicas"].filter(Boolean).join(" ").trim();
  const tertiary = ["treino", "dicas", locationQuery].filter(Boolean).join(" ").trim();

  return [primary, secondary, tertiary];
}

function buildGoalQuery(goal?: string) {
  if (goal === "lose_weight") return "emagrecer perder gordura";
  if (goal === "gain_muscle") return "ganhar massa hipertrofia musculacao";
  if (goal === "body_recomposition") return "definicao recomposicao corporal";
  if (goal === "improve_conditioning") return "condicionamento cardio resistencia";
  return "treino";
}

function buildLocationQuery(location?: string) {
  if (location === "gym") return "academia musculacao";
  return "treino em casa";
}

async function getPostsBySearch(search: string) {
  const response = await fetch(`${WORDPRESS_BASE}?search=${encodeURIComponent(search)}&_embed&per_page=8`, {
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as WordPressPost[];
}

async function getLatestPosts() {
  const response = await fetch(`${WORDPRESS_BASE}?_embed&per_page=8`, {
    next: { revalidate: 3600 }
  });

  if (!response.ok) {
    return [];
  }

  return (await response.json()) as WordPressPost[];
}

function toArticleRecommendation(
  post: WordPressPost,
  goal?: string,
  location?: string,
  level?: string
): ArticleRecommendation {
  const content = post.content?.rendered || "";
  const cleanText = content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const words = cleanText ? cleanText.split(/\s+/).length : 0;
  const readingTime = words > 0 ? Math.ceil(words / 200) : 1;
  const image =
    post._embedded?.["wp:featuredmedia"]?.[0]?.media_details?.sizes?.medium?.source_url ||
    post._embedded?.["wp:featuredmedia"]?.[0]?.source_url ||
    ARTICLE_PLACEHOLDER_IMAGE;
  const author = post._embedded?.author?.[0]?.name || "Hora do Treino";
  const rawTitle = decodeWordPressText(post.title?.rendered || post.slug?.replaceAll("-", " ") || "Artigo");
  const title = capitalize(rawTitle);

  return {
    title,
    url: post.link || `https://horadotreino.com.br/${post.slug || ""}/`,
    image,
    tags: inferArticleTags(`${title} ${cleanText}`, goal, location, level),
    author,
    readingTime
  };
}

function inferArticleTags(content: string, goal?: string, location?: string, level?: string) {
  const normalized = content.toLowerCase();
  const tags = new Set<string>();

  const goalTag = mapGoalToArticleTag(goal);
  const levelTag = mapLevelToArticleTag(level);

  if (goalTag) tags.add(goalTag);
  if (levelTag) tags.add(levelTag);
  if (location === "gym") {
    tags.add("academia");
  } else {
    tags.add("casa");
  }

  if (normalized.includes("emagrec")) tags.add("emagrecimento");
  if (normalized.includes("hipertrof") || normalized.includes("massa muscular")) tags.add("hipertrofia");
  if (normalized.includes("defini")) tags.add("definicao");
  if (normalized.includes("condicion") || normalized.includes("resist")) tags.add("condicionamento");
  if (normalized.includes("iniciant")) tags.add("iniciante");
  if (normalized.includes("academia")) tags.add("academia");
  if (normalized.includes("casa")) tags.add("casa");

  return Array.from(tags);
}

function decodeWordPressText(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&#8211;|&#8212;/g, "-")
    .replace(/&#8217;|&#8216;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}



