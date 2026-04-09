import clsx from "clsx";
import { ReactNode } from "react";

export function PageShell({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={clsx("min-h-screen min-h-[100dvh] bg-spotlight px-4 py-6 sm:px-6 lg:px-8", className)}>{children}</main>;
}

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("mx-auto w-full max-w-6xl", className)}>{children}</div>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        "glass rounded-[28px] border border-white/10 bg-[#101010]/84 p-5 shadow-[0_16px_40px_rgba(0,0,0,0.26)] sm:p-6",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  description
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="space-y-3">
      {eyebrow ? (
        <p className="text-xs font-semibold uppercase tracking-[0.32em] text-primary">{eyebrow}</p>
      ) : null}
      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-white sm:text-5xl">{title}</h1>
      {description ? <p className="max-w-2xl text-sm text-white/66 sm:text-base">{description}</p> : null}
    </div>
  );
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  const styles = {
    primary: "bg-gradient-to-r from-primary to-primaryStrong text-white shadow-glow hover:opacity-95",
    secondary: "border border-white/15 bg-white/5 text-white hover:bg-white/10",
    ghost: "text-white/72 hover:text-white"
  };

  return (
    <button
      className={clsx(
        "inline-flex min-h-12 items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
        styles[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function BadgeGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx("flex min-w-0 flex-wrap gap-2", className)}>{children}</div>;
}

export function Badge({
  children,
  className
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex min-w-0 max-w-full items-center justify-center whitespace-nowrap rounded-full border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/72 sm:px-3 sm:text-xs",
        className
      )}
    >
      {children}
    </span>
  );
}
