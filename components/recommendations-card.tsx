"use client";

import { useState } from "react";
import clsx from "clsx";
import { Building2, ChevronDown, Dumbbell, ExternalLink, Lightbulb, Salad, ShoppingBag } from "lucide-react";
import { Card } from "@/components/ui";
import {
  RECOMMENDATIONS_DATA,
  type RecommendationCard,
} from "@/lib/recommendations-data";
import type { Goal, Experience, HomeEquipment } from "@/lib/types";

type Tab = "howto" | "training" | "nutrition" | "equipment" | "condo";

type Props = {
  goal?: Goal;
  level?: string;
  equipment?: string[];
  location?: string;
  // Locais marcados (Premium pode ter mais de um) — libera a aba Condomínio.
  locations?: string[];
  // Quem está começando (< 5 treinos) vê "Como usar" primeiro.
  totalWorkouts?: number;
};

const NEW_USER_WORKOUTS = 5;

function filterCards(
  cards: RecommendationCard[],
  goal: Goal | undefined,
  level: Experience | undefined,
  userEquipment: HomeEquipment[],
  location: string | undefined
): RecommendationCard[] {
  return cards.filter((card) => {
    if (card.goals.length > 0 && goal && !card.goals.includes(goal)) return false;
    if (card.levels.length > 0 && level && !card.levels.includes(level)) return false;
    // Local: se o card é restrito a certos locais, só mostra no local do usuário.
    if (card.locations && card.locations.length > 0 && location && !card.locations.includes(location as (typeof card.locations)[number])) return false;
    if (card.equipment.length > 0) {
      const hasAll = card.equipment.every((e) => userEquipment.includes(e));
      if (!hasAll) return false;
    }
    if (card.missingEquipment.length > 0) {
      const hasMissing = card.missingEquipment.some((e) => userEquipment.includes(e));
      if (hasMissing) return false;
    }
    return true;
  });
}

export function RecommendationsCard({ goal, level, equipment = [], location, locations = [], totalWorkouts = 0 }: Props) {
  const isNewUser = totalWorkouts < NEW_USER_WORKOUTS;
  const [activeTab, setActiveTab] = useState<Tab>(isNewUser ? "howto" : "training");
  // Só um item aberto por vez: a informação está lá, mas não enche a tela.
  const [openId, setOpenId] = useState<string | null>(null);

  const userLevel = level as Experience | undefined;
  const userEquipment = equipment as HomeEquipment[];
  // Materiais só fazem sentido para quem treina em casa. No condomínio/academia
  // os aparelhos são do local, então não mostramos a aba de compra de equipamento.
  const isHome = (location ?? "home") === "home";
  const usesCondo = location === "condo_gym" || locations.includes("condo_gym");

  type TabDef = { id: Tab; label: string; icon: typeof Dumbbell; cards: RecommendationCard[] };
  const howToTab: TabDef = { id: "howto", label: "Como usar", icon: Lightbulb, cards: RECOMMENDATIONS_DATA.howTo };
  const tabs: TabDef[] = ([
    ...(isNewUser ? [howToTab] : []),
    { id: "training" as Tab, label: "Treino", icon: Dumbbell, cards: filterCards(RECOMMENDATIONS_DATA.training, goal, userLevel, userEquipment, location) },
    { id: "nutrition" as Tab, label: "Nutrição", icon: Salad, cards: filterCards(RECOMMENDATIONS_DATA.nutrition, goal, userLevel, userEquipment, location) },
    ...(usesCondo ? [{ id: "condo" as Tab, label: "Condomínio", icon: Building2, cards: RECOMMENDATIONS_DATA.condo }] : []),
    ...(isHome
      ? [{ id: "equipment" as Tab, label: "Materiais", icon: ShoppingBag, cards: filterCards(RECOMMENDATIONS_DATA.equipment, goal, userLevel, userEquipment, location) }]
      : []),
    ...(isNewUser ? [] : [howToTab])
  ] as TabDef[]).filter((tab) => tab.cards.length > 0);

  if (!tabs.length) return null;

  // Se o local ativo esconder a aba atual, volta para a primeira aba visível.
  const visibleTab = tabs.some((t) => t.id === activeTab) ? activeTab : tabs[0]!.id;
  const MAX_CARDS = 6;
  const activeCards = (tabs.find((t) => t.id === visibleTab)?.cards ?? []).slice(0, MAX_CARDS);

  return (
    <Card className="rounded-[24px] border-white/[0.06] p-4 shadow-none sm:p-4">
      <div className="mb-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/90">Para você</p>
        <p className="mt-0.5 text-[12px] text-white/45">Dicas do seu personal, baseadas no seu perfil</p>
      </div>

      {/* Abas (rolam para o lado se não couberem) */}
      <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = visibleTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => {
                setActiveTab(id);
                setOpenId(null);
              }}
              className={clsx(
                "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-semibold transition",
                isActive ? "bg-primary/15 text-primary" : "bg-white/[0.04] text-white/50 hover:text-white/75"
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {label}
            </button>
          );
        })}
      </div>

      {/* Itens fechados; toque para ler */}
      <div className="divide-y divide-white/[0.06] rounded-[16px] border border-white/[0.07]">
        {activeCards.map((card) => {
          const isOpen = openId === card.id;
          return (
            <div key={card.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : card.id)}
                aria-expanded={isOpen}
                className="flex min-h-12 w-full items-center gap-2.5 px-3.5 py-2.5 text-left"
              >
                {card.icon === "dumbbell" ? (
                  <Dumbbell className="h-[18px] w-[18px] shrink-0 text-primary" aria-hidden />
                ) : card.emoji ? (
                  <span className="shrink-0 text-[18px] leading-none">{card.emoji}</span>
                ) : null}
                <span className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-white/90">{card.title}</span>
                <ChevronDown
                  className={clsx("h-4 w-4 shrink-0 text-white/35 transition-transform", isOpen && "rotate-180")}
                  aria-hidden
                />
              </button>
              {isOpen ? (
                <div className="px-3.5 pb-3.5 pl-[42px]">
                  <p className="text-[13px] leading-[1.55] text-white/60">{card.body}</p>
                  {card.link ? (
                    <a
                      href={card.link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border border-primary/25 bg-primary/10 px-3 text-[12px] font-semibold text-primary transition hover:bg-primary/16"
                    >
                      {card.link.label}
                      <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
