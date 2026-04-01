"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui";

const links = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Usuarios" },
  { href: "/admin/exercises", label: "Exercícios" },
  { href: "/admin/errors", label: "Erros" }
];

export function AdminSidebar() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function handleLogout() {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);

    try {
      await fetch("/api/admin/session", {
        method: "DELETE",
        credentials: "include"
      });
    } finally {
      router.replace("/admin/login");
      router.refresh();
    }
  }

  return (
    <aside className="min-w-0 rounded-[28px] border border-white/10 bg-black/20 p-4 sm:p-5 xl:p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary">Hora do Treino</p>
      <h2 className="mt-3 text-2xl font-semibold text-white">Admin</h2>
      <nav className="mt-8 grid gap-2.5">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-white/8 px-4 py-3 text-sm text-white/72 transition hover:border-primary/30 hover:bg-primary/10 hover:text-white"
          >
            {link.label}
          </Link>
        ))}
      </nav>
      <Button
        variant="secondary"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="mt-6 w-full border-white/10 bg-transparent text-white/72 hover:bg-white/[0.04] hover:text-white"
      >
        {isLoggingOut ? "Saindo..." : "Sair do admin"}
      </Button>
    </aside>
  );
}
