"use client";

import clsx from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  Instagram,
  MessageCircle,
  Music2,
  Share2,
  Youtube
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const APP_SHARE_URL = "https://app.horadotreino.com.br/";
const APP_SHARE_URL_LABEL = "app.horadotreino.com.br";
const FEEDBACK_URL = "https://horadotreino.com.br/fale-conosco/";
const SOCIAL_LINKS = [
  {
    label: "Instagram",
    href: "https://instagram.com/horadotreino_oficial",
    icon: Instagram
  },
  {
    label: "TikTok",
    href: "https://www.tiktok.com/@horadotreinooficial",
    icon: Music2
  },
  {
    label: "YouTube",
    href: "https://www.youtube.com/@HoradoTreino",
    icon: Youtube
  }
] as const;

export function AppVersionFooter() {
  const pathname = usePathname();
  const [copyStatus, setCopyStatus] = useState<"idle" | "success" | "error">("idle");
  const timeoutRef = useRef<number | null>(null);
  const isAdminRoute = pathname?.startsWith("/admin") ?? false;
  const isAppRoute = ["/dashboard", "/treino", "/calendario", "/progresso", "/perfil"].some((route) =>
    pathname?.startsWith(route)
  );

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  async function handleCopyLink() {
    const copied = await copyText(APP_SHARE_URL);

    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
    }

    if (copied) {
      setCopyStatus("success");
      trackFooterInteraction("footer_copy_link", {
        destination: APP_SHARE_URL
      });
    } else {
      setCopyStatus("error");
    }

    timeoutRef.current = window.setTimeout(() => {
      setCopyStatus("idle");
    }, copied ? 2200 : 2800);
  }

  if (isAppRoute) {
    return null;
  }

  return (
    <footer className="border-t border-white/10 bg-[#040404]/70">
      {!isAdminRoute ? (
        <section className="px-4 py-3 sm:px-6 sm:py-3.5 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">
            <div className="grid gap-2.5 lg:grid-cols-3">
                  <article className="flex min-h-[168px] h-full flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-3.5 transition duration-200 hover:border-primary/30 hover:bg-white/[0.045]">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary">
                          <Instagram className="h-5 w-5" />
                        </span>
                        <h3 className="text-[15px] font-semibold text-white">Acompanhe nas redes</h3>
                      </div>
                      <p className="max-w-[28ch] text-sm leading-5 text-white/58">Conteúdos, dicas e bastidores.</p>
                    </div>

                    <div className="pt-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {SOCIAL_LINKS.map((link) => {
                          const Icon = link.icon;

                          return (
                            <a
                              key={link.label}
                              href={link.href}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={link.label}
                              title={link.label}
                              onClick={() =>
                              trackFooterInteraction("footer_social_click", {
                                network: link.label.toLowerCase(),
                                destination: link.href
                              })
                            }
                              className="group inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white/74 transition duration-200 hover:border-primary/30 hover:bg-white/[0.045] hover:text-primary"
                            >
                              <Icon className="h-[18px] w-[18px]" />
                            </a>
                          );
                        })}
                      </div>
                    </div>
                  </article>

                  <article className="flex min-h-[168px] h-full flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-3.5 transition duration-200 hover:border-primary/30 hover:bg-white/[0.045]">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary">
                          <Share2 className="h-5 w-5" />
                        </span>
                        <h3 className="text-[15px] font-semibold text-white">Compartilhe o app</h3>
                      </div>
                      <p className="max-w-[32ch] text-sm leading-5 text-white/58">
                        Envie para quem quer treinar em casa com método.
                      </p>
                    </div>

                    <div className="pt-3">
                      <div className="flex flex-col gap-1.5 rounded-2xl border border-white/10 bg-black/20 p-1.5 sm:flex-row sm:items-center">
                        <div className="min-w-0 flex-1 rounded-[14px] bg-white/[0.03] px-3 py-2">
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-white/32">Link do app</p>
                          <p className="mt-1 break-all text-sm font-medium text-white/84 sm:break-normal">{APP_SHARE_URL_LABEL}</p>
                        </div>
                        <button
                          type="button"
                          onClick={handleCopyLink}
                          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[16px] border border-primary/30 bg-primary/12 px-3.5 py-2.5 text-sm font-semibold text-primary transition duration-200 hover:border-primary/45 hover:bg-primary/16 hover:text-white"
                        >
                          {copyStatus === "success" ? (
                            <Check className="h-[18px] w-[18px]" />
                          ) : (
                            <Copy className="h-[18px] w-[18px]" />
                          )}
                          {copyStatus === "success" ? "Link copiado" : "Copiar link"}
                        </button>
                      </div>
                      <span aria-live="polite" className="mt-1 block min-h-[14px] text-[11px] text-white/48">
                        {copyStatus === "error" ? "Não foi possível copiar automaticamente." : ""}
                      </span>
                    </div>
                  </article>

                  <article className="flex min-h-[168px] h-full flex-col rounded-[22px] border border-white/10 bg-white/[0.03] p-3.5 transition duration-200 hover:border-primary/30 hover:bg-white/[0.045]">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-primary">
                          <MessageCircle className="h-5 w-5" />
                        </span>
                        <h3 className="text-[15px] font-semibold text-white">Envie seu feedback</h3>
                      </div>
                      <p className="max-w-[34ch] text-sm leading-5 text-white/58">
                        Sugestões, elogios e críticas ajudam a melhorar o projeto.
                      </p>
                    </div>

                    <div className="pt-3">
                      <a
                        href={FEEDBACK_URL}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() =>
                          trackFooterInteraction("footer_feedback_click", {
                            destination: FEEDBACK_URL
                          })
                        }
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-sm font-semibold text-white transition duration-200 hover:border-primary/30 hover:bg-primary/12 hover:text-primary"
                      >
                        Enviar feedback
                        <ArrowUpRight className="h-[18px] w-[18px]" />
                      </a>
                    </div>
                  </article>
            </div>
          </div>
        </section>
      ) : null}

      <div className="px-4 py-2.5 sm:px-6 sm:py-3 lg:px-8">
        <div
          className={clsx(
            "mx-auto w-full max-w-6xl",
            !isAdminRoute && "border-t border-white/8 pt-2.5"
          )}
        >
          <div className="flex flex-col gap-3 text-sm text-white/48 sm:gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <span className="text-sm font-semibold text-white/82">Hora do Treino&reg;</span>
              <span className="hidden text-white/16 sm:inline">•</span>
              <span>CNPJ: 34.229.533/0001-61</span>
            </div>

            <nav
              aria-label="Links institucionais do rodapé"
              className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm"
            >
              <Link
                href="/politica-de-privacidade"
                className="font-medium text-white/62 transition duration-200 hover:text-primary"
              >
                Política de Privacidade
              </Link>
              <span className="text-white/16">|</span>
              <Link href="/termos-de-uso" className="font-medium text-white/62 transition duration-200 hover:text-white">
                Termos de Uso
              </Link>
            </nav>

            <p className="text-xs text-white/36">Todos os direitos reservados</p>
          </div>
        </div>
      </div>
    </footer>
  );
}

async function copyText(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return fallbackCopyText(text);
    }
  }

  return fallbackCopyText(text);
}

function fallbackCopyText(text: string) {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "absolute";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
}

function trackFooterInteraction(eventName: string, params: Record<string, string>) {
  trackEvent(eventName, {
    section: "footer",
    ...params
  });
}
