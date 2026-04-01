import clsx from "clsx";
import { DISCLAIMER_COMPACT_TEXT, DISCLAIMER_LINES } from "@/lib/legal-content";

export function Disclaimer({
  variant = "full",
  className
}: {
  variant?: "full" | "compact";
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-left text-white/72",
        variant === "compact" ? "text-xs leading-5 sm:text-sm" : "text-sm leading-6",
        className
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/48">Importante</p>
      {variant === "compact" ? (
        <p className="mt-2">{DISCLAIMER_COMPACT_TEXT}</p>
      ) : (
        <div className="mt-2 space-y-2">
          {DISCLAIMER_LINES.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </div>
  );
}
