import { logError, logWarn } from "@/lib/server-logger";
import { stripLegacyQuizFields } from "@/lib/quiz-answers";
import { QuizAnswers } from "@/lib/types";

type UserAnswersRow = {
  user_id: string;
  answers: QuizAnswers;
  created_at?: string;
};

type UserAnswersError = {
  message: string;
} | null;

type SupabaseLike = {
  from: (table: string) => any;
};

export async function getUserAnswersByUserId(supabase: SupabaseLike, userId: string) {
  const { data, error } = (await supabase
    .from("user_answers")
    .select("user_id, answers, created_at")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: UserAnswersRow | null;
    error: UserAnswersError;
  };

  if (error) {
    logError("PROFILE", "User answers fetch failed", { error: error.message ?? "unknown" });
    return null;
  }

  return stripLegacyQuizFields(data?.answers ?? null);
}

export async function getUserAnswersMap(supabase: SupabaseLike, userIds: string[]) {
  if (!userIds.length) {
    return new Map<string, QuizAnswers>();
  }

  const uniqueUserIds = Array.from(new Set(userIds));
  const { data, error } = (await supabase
    .from("user_answers")
    .select("user_id, answers, created_at")
    .in("user_id", uniqueUserIds)) as {
    data: UserAnswersRow[] | null;
    error: UserAnswersError;
  };

  if (error) {
    logError("PROFILE", "User answers map failed", { error: error.message ?? "unknown" });
    return new Map<string, QuizAnswers>();
  }

  const sortedRows = [...(data ?? [])].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return bTime - aTime;
  });

  const answersMap = new Map<string, QuizAnswers>();

  for (const item of sortedRows) {
    if (!answersMap.has(item.user_id)) {
      const answers = stripLegacyQuizFields(item.answers);
      if (answers) {
        answersMap.set(item.user_id, answers);
      }
    }
  }

  return answersMap;
}

export async function saveUserAnswers(supabase: SupabaseLike, userId: string, answers: QuizAnswers) {
  const sanitizedAnswers = stripLegacyQuizFields(answers);
  if (!sanitizedAnswers) {
    return {
      data: null,
      error: { message: "Invalid quiz answers payload." }
    };
  }

  const payload = {
    user_id: userId,
    answers: sanitizedAnswers
  };

  const { data: existingAnswers, error: existingAnswersError } = (await supabase
    .from("user_answers")
    .select("user_id, answers, created_at")
    .eq("user_id", userId)
    .maybeSingle()) as {
    data: UserAnswersRow | null;
    error: UserAnswersError;
  };

  if (existingAnswersError) {
    logWarn("PROFILE", "User answers save failed", { error: existingAnswersError.message ?? "unknown" });
    return {
      data: null,
      error: existingAnswersError
    };
  }

  const result = existingAnswers
    ? await supabase.from("user_answers").update({ answers: sanitizedAnswers }).eq("user_id", userId).select().single()
    : await supabase.from("user_answers").insert(payload).select().single();

  return result;
}
