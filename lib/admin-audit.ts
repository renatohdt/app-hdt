import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase-admin";
import { logError } from "@/lib/server-logger";

type AdminAuditAction =
  | "login"
  | "logout"
  | "view_extended_user_data"
  | "exercise_created"
  | "exercise_updated"
  | "exercise_deleted";

export async function recordAdminAuditLog({
  adminId,
  adminEmail,
  action,
  targetType,
  targetId,
  metadata
}: {
  adminId: string;
  adminEmail?: string | null;
  action: AdminAuditAction;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from("admin_audit_logs").insert({
    admin_id: adminId,
    admin_email: adminEmail ?? null,
    action,
    target_type: targetType,
    target_id: targetId ?? null,
    metadata: metadata ?? {}
  });

  if (error) {
    logError("ADMIN_AUDIT", "Audit insert failed", {
      action,
      target_type: targetType,
      target_id: targetId ?? null
    });
  }
}
