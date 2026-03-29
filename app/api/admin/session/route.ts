import { recordAdminAuditLog } from "@/lib/admin-audit";
import { clearAdminSessionCookie, readAdminSession } from "@/lib/admin-session";
import { requireAdminUser } from "@/lib/server-auth";
import { jsonSuccess } from "@/lib/server-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = await requireAdminUser(request, "ADMIN");
  if (admin.response) {
    admin.response.headers.set("Cache-Control", "no-store");
    return admin.response;
  }

  const response = jsonSuccess(
    {
      authenticated: true,
      admin: true,
      user: admin.user
    },
    200
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function DELETE(request: Request) {
  const adminSession = readAdminSession(request);

  if (adminSession) {
    await recordAdminAuditLog({
      adminId: adminSession.sub,
      adminEmail: adminSession.email,
      action: "logout",
      targetType: "admin_session",
      targetId: adminSession.sub,
      metadata: {
        mode: adminSession.mode
      }
    });
  }

  const response = jsonSuccess(
    {
      authenticated: false,
      loggedOut: true
    },
    200
  );
  clearAdminSessionCookie(response);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
