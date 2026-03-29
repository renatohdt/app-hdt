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
        <Container className="py-12">{children}</Container>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <Container className="grid gap-6 py-6 lg:grid-cols-[260px_1fr]">
        <AdminRouteGuard>
          <AdminSidebar />
          <div className="min-w-0">{children}</div>
        </AdminRouteGuard>
      </Container>
    </PageShell>
  );
}
