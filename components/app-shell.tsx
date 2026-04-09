import clsx from "clsx";
import { ReactNode } from "react";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { PageShell } from "@/components/ui";

export function AppShell({
  children,
  className,
  showNav = true
}: {
  children: ReactNode;
  className?: string;
  showNav?: boolean;
}) {
  return (
    <PageShell className="relative overflow-x-hidden px-4 pb-[var(--app-nav-offset)] pt-[calc(0.9rem+var(--app-safe-top))] sm:px-6 sm:pt-[calc(1.15rem+var(--app-safe-top))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.2),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-24 -z-10 h-[24rem] bg-[radial-gradient(circle_at_center,rgba(23,163,74,0.12),transparent_52%)] blur-3xl" />

      <div className={clsx("mx-auto w-full max-w-[var(--app-shell-max)] space-y-4 sm:space-y-5", className)}>{children}</div>

      {showNav ? <AppBottomNav /> : null}
    </PageShell>
  );
}
