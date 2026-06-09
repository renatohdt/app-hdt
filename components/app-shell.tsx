import clsx from "clsx";
import { ReactNode, useEffect } from "react";
import { AppBottomNav } from "@/components/app-bottom-nav";
import { PageShell } from "@/components/ui";
import { FeedbackModal } from "@/components/feedback-modal";

const SCREEN_COUNT_KEY = "app_screen_count";

export function incrementScreenCount() {
  if (typeof window === "undefined") return;
  const current = parseInt(localStorage.getItem(SCREEN_COUNT_KEY) ?? "0", 10);
  localStorage.setItem(SCREEN_COUNT_KEY, String(current + 1));
}

export function getScreenCount(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(SCREEN_COUNT_KEY) ?? "0", 10);
}

export function AppShell({
  children,
  className,
  showNav = true
}: {
  children: ReactNode;
  className?: string;
  showNav?: boolean;
}) {
  useEffect(() => { incrementScreenCount(); }, []);

  return (
    <PageShell className="relative overflow-x-hidden px-4 pb-[var(--app-nav-offset)] pt-[calc(0.9rem+var(--app-safe-top))] sm:px-6 sm:pt-[calc(1.15rem+var(--app-safe-top))]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[26rem] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.2),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-24 -z-10 h-[24rem] bg-[radial-gradient(circle_at_center,rgba(23,163,74,0.12),transparent_52%)] blur-3xl" />

      <div className={clsx("mx-auto w-full max-w-[var(--app-shell-max)] space-y-4 sm:space-y-5", className)}>{children}</div>

      {showNav ? <AppBottomNav /> : null}
      <FeedbackModal />
    </PageShell>
  );
}
