"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AdminRouteGuard } from "@/components/admin-route-guard";
import { AdminSidebar } from "@/components/admin-sidebar";
import { Container, PageShell } from "@/components/ui";

export function AdminLayoutShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/admin/login") {
    return (
      <PageShell>
        <Container className="max-w-3xl py-12">{children}</Container>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Container className="max-w-[88rem] py-6">
        <AdminRouteGuard>
          <div className="grid items-start gap-6 xl:grid-cols-[220px_minmax(0,1fr)] 2xl:grid-cols-[236px_minmax(0,1fr)]">
            <div className="xl:sticky xl:top-6">
              <AdminSidebar />
            </div>
            <div className="min-w-0">{children}</div>
          </div>
        </AdminRouteGuard>
      </Container>
    </PageShell>
  );
}
