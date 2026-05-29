"use client";

import { useState } from "react";
import { Dumbbell, Salad, ShoppingBag, ExternalLink } from "lucide-react";
import { Card } from "@/components/ui";
import {
  RECOMMENDATIONS_DATA,
  type RecommendationCard,
} from "@/lib/recommendations-data";
import type { Goal, Experience, HomeEquipment } from "@/lib/types";

type Tab = "training" | "nutrition" | "equipment";

type Props = {
  goal?: Goal;
  level?: string;
  equipment?: string[];
};

function filterCards(
  cards: RecommendationCard[],
  goal: Goal | undefined,
  level: Experience | undefined,
  userEquipment: HomeEquipment[]
): RecommendationCard[] {
  return cards.filter((card) => {
    if (card.goals.length > 0 && goal && !card.goals.includes(goal)) return false;
    if (card.levels.length > 0 && level && !card.levels.includes(level)) return false;
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

export function RecommendationsCard({ goal, level, equipment = [] }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("training");

  const userLevel = level as Experience | undefined;
  const userEquipment = equipment as HomeEquipment[];

  const trainingCards = filterCards(RECOMMENDATIONS_DATA.training, goal, userLevel, userEquipment);
  const nutritionCards = filterCards(RECOMMENDATIONS_DATA.nutrition, goal, userLevel, userEquipment);
  const equipmentCards = filterCards(RECOMMENDATIONS_DATA.equipment, goal, userLevel, userEquipment);

  const tabs: { id: Tab; label: string; icon: typeof Dumbbell; cards: RecommendationCard[] }[] = [
    { id: "training", label: "Treino", icon: Dumbbell, cards: trainingCards },
    { id: "nutrition", label: "Nutrição", icon: Salad, cards: nutritionCards },
    { id: "equipment", label: "Materiais", icon: ShoppingBag, cards: equipmentCards },
  ];

  const MAX_CARDS = 3;
  const activeCards = (tabs.find((t) => t.id === activeTab)?.cards ?? []).slice(0, MAX_CARDS);

  return (
    <Card className="rounded-[24px] border-white/[0.06] p-[18px] shadow-none sm:p-[18px]">
      <div className="mb-4">
        <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.22em] text-primary/88">
          Para você
        </p>
        <p className="text-[13px] text-white/45">Dicas baseadas no seu perfil</p>
      </div>

      {/* Abas */}
      <div className="mb-4 flex gap-2">
        {tabs.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-[12px] py-[7px] text-[12px] font-semibold transition ${
                isActive
                  ? "bg-primary/15 text-primary"
                  : "bg-white/[0.04] text-white/50 hover:bg-white/[0.07] hover:text-white/70"
              }`}
            >
              <Icon className="h-[13px] w-[13px] shrink-0" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-[10px]">
        {activeCards.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-white/40">
            Nenhuma recomendação disponível no momento.
          </p>
        ) : (
          activeCards.map((card) => (
            <div
              key={card.id}
              className="rounded-[14px] border border-white/[0.07] bg-white/[0.03] p-[14px]"
            >
              <div className="flex items-start gap-[10px]">
                {card.emoji && (
                  <span className="shrink-0 text-[22px] leading-none">{card.emoji}</span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[13px] font-semibold leading-snug tracking-tight text-white/90">
                    {card.title}
                  </p>
                  <p className="text-[12px] leading-[1.55] text-white/52">{card.body}</p>
                  {card.link && (
                    <a
                      href={card.link.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="mt-[10px] inline-flex items-center gap-1.5 rounded-[10px] border border-primary/25 bg-primary/10 px-3 py-[6px] text-[12px] font-semibold text-primary transition hover:bg-primary/16"
                    >
                      {card.link.label}
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
