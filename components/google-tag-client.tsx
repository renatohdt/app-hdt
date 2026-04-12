"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { GA_MEASUREMENT_ID, pageview } from "@/lib/analytics";

export function GoogleTagClient() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastTrackedPagePathRef = useRef<string | null>(null);
  const pagePath = useMemo(() => {
    const search = searchParams?.toString() ?? "";
    if (!pathname) {
      return "";
    }

    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !pagePath) {
      return;
    }

    if (lastTrackedPagePathRef.current === pagePath) {
      return;
    }

    lastTrackedPagePathRef.current = pagePath;
    pageview(pagePath);
  }, [pagePath]);

  return null;
}
