import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { getUserAnswersByUserId } from "@/lib/user-answers";

export async function getDashboardPayloadByUserId(userId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data: user } = await supabase.from("users").select("*").eq("id", userId).single();
  if (!user) return null;

  const answers = await getUserAnswersByUserId(supabase, user.id);
  const { data: workout } = await supabase
    .from("workouts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!workout) return null;

  return { user: { ...user, answers }, workout };
}
