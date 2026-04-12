"use client";

import Script from "next/script";
import { Suspense, createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { MetaPixelPageViewTracker } from "@/components/meta-pixel-page-view-tracker";
import { fetchWithAuth, getAccessToken } from "@/lib/authenticated-fetch";
import {
  type ConsentPreferenceMap,
  type ConsentScope,
  DEFAULT_CONSENT_PREFERENCES
} from "@/lib/consent-types";
import {
  createStoredConsentPreferences,
  readStoredConsentPreferences,
  type StoredConsentPreferences,
  writeStoredConsentPreferences
} from "@/lib/consent-storage";
import { clientLogError, clientLogInfo } from "@/lib/client-logger";
import { updateGtagConsent } from "@/lib/analytics";
import { FACEBOOK_PIXEL_ID } from "@/lib/facebook-pixel";

declare global {
  interface Window {
    __googleAdsenseScriptLoaded?: boolean;
  }
}

type ConsentApiResponse = {
  success?: boolean;
  data?: {
    version?: string;
    consents?: Partial<Record<ConsentScope, boolean>>;
    hasStoredConsents?: boolean;
  };
};

type ConsentContextValue = {
  ready: boolean;
  hasInteracted: boolean;
  preferences: ConsentPreferenceMap;
  canUseAds: boolean;
  canUseMarketing: boolean;
  savePreferences: (nextPreferences: ConsentPreferenceMap) => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsentPreferences() {
  const value = useContext(ConsentContext);

  if (!value) {
    throw new Error("useConsentPreferences deve ser usado dentro de ConsentProvider.");
  }

  return value;
}

export function ConsentProvider({
  children,
  currentVersion
}: {
  children: React.ReactNode;
  currentVersion: string;
}) {
  const [ready, setReady] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [preferences, setPreferences] = useState<ConsentPreferenceMap>(DEFAULT_CONSENT_PREFERENCES);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [draftPreferences, setDraftPreferences] = useState<ConsentPreferenceMap>(DEFAULT_CONSENT_PREFERENCES);
  const lastSyncedPayloadRef = useRef<string>("");
  const gtagConsentInitializedRef = useRef(false);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      const localPreferences = readStoredConsentPreferences();

      if (localPreferences?.version === currentVersion) {
        if (!active) return;

        applyStoredPreferences(localPreferences);
        setReady(true);
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) {
          if (!active) return;
          setReady(true);
          return;
        }

        const response = await fetchWithAuth("/api/consents");
        const payload = (await response.json().catch(() => null)) as ConsentApiResponse | null;

        if (!active) return;

        if (response.ok && payload?.success && payload.data?.hasStoredConsents) {
          const stored = createStoredConsentPreferences(currentVersion, {
            marketing: Boolean(payload.data.consents?.marketing),
            ads: Boolean(payload.data.consents?.ads)
          });

          applyStoredPreferences(stored);
          writeStoredConsentPreferences(stored);
        }
      } catch (error) {
        clientLogError("CONSENT BOOTSTRAP ERROR", error);
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [currentVersion]);

  // Aplica o estado de consentimento ao GA4 assim que o provider termina de carregar.
  // Isso garante que o gtag reflita as preferências salvas anteriormente pelo usuário.
  useEffect(() => {
    if (!ready || gtagConsentInitializedRef.current) {
      return;
    }
    gtagConsentInitializedRef.current = true;
    updateGtagConsent(preferences);
  }, [ready, preferences]);

  useEffect(() => {
    if (!ready || !hasInteracted) {
      return;
    }

    const stored = createStoredConsentPreferences(currentVersion, preferences);
    writeStoredConsentPreferences(stored);
  }, [currentVersion, hasInteracted, preferences, ready]);

  useEffect(() => {
    if (!ready || !hasInteracted) {
      return;
    }

    const payload = JSON.stringify({
      consents: preferences,
      source: "preference_center"
    });

    if (lastSyncedPayloadRef.current === payload) {
      return;
    }

    let active = true;

    async function syncConsents() {
      try {
        const token = await getAccessToken();
        if (!token || !active) {
          return;
        }

        const response = await fetchWithAuth("/api/consents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: payload
        });

        if (response.ok && active) {
          lastSyncedPayloadRef.current = payload;
        }
      } catch (error) {
        clientLogError("CONSENT SYNC ERROR", error);
      }
    }

    void syncConsents();

    return () => {
      active = false;
    };
  }, [hasInteracted, preferences, ready]);

  function applyStoredPreferences(value: StoredConsentPreferences) {
    setHasInteracted(value.hasInteracted);
    setPreferences(value.preferences);
    setDraftPreferences(value.preferences);
  }

  function persistPreferencesLocally(nextPreferences: ConsentPreferenceMap, interacted = true) {
    writeStoredConsentPreferences(createStoredConsentPreferences(currentVersion, nextPreferences, interacted));
  }

  function acceptAll() {
    const next = {
      marketing: true,
      ads: true
    };

    updateGtagConsent(next);
    persistPreferencesLocally(next);
    setHasInteracted(true);
    setPreferences(next);
    setDraftPreferences(next);
    setIsCustomizing(false);
    setIsPanelOpen(false);
  }

  function rejectNonEssential() {
    updateGtagConsent(DEFAULT_CONSENT_PREFERENCES);
    persistPreferencesLocally(DEFAULT_CONSENT_PREFERENCES);
    setHasInteracted(true);
    setPreferences(DEFAULT_CONSENT_PREFERENCES);
    setDraftPreferences(DEFAULT_CONSENT_PREFERENCES);
    setIsCustomizing(false);
    setIsPanelOpen(false);
  }

  function openCustomization() {
    setDraftPreferences(preferences);
    setIsCustomizing(true);
    setIsPanelOpen(true);
  }

  function saveCustomPreferences() {
    updateGtagConsent(draftPreferences);
    persistPreferencesLocally(draftPreferences);
    setHasInteracted(true);
    setPreferences(draftPreferences);
    setIsPanelOpen(false);
    setIsCustomizing(false);
  }

  const contextValue = useMemo<ConsentContextValue>(
    () => ({
      ready,
      hasInteracted,
      preferences,
      canUseAds: ready && preferences.ads,
      canUseMarketing: ready && preferences.marketing,
      savePreferences: (nextPreferences) => {
        persistPreferencesLocally(nextPreferences);
        setHasInteracted(true);
        setPreferences(nextPreferences);
        setDraftPreferences(nextPreferences);
        setIsCustomizing(false);
        setIsPanelOpen(false);
      }
    }),
    [hasInteracted, preferences, ready]
  );

  const shouldShowBanner = ready && (!hasInteracted || isPanelOpen);

  return (
    <ConsentContext.Provider value={contextValue}>
      <ConsentManagedScripts
        canUseAds={contextValue.canUseAds}
        canUseMarketing={contextValue.canUseMarketing}
      />
      {children}
      {shouldShowBanner ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-3 sm:p-5">
          <div className="pointer-events-auto mx-auto w-full max-w-3xl rounded-[24px] border border-white/8 bg-[#0b0b0b]/95 p-3.5 shadow-[0_18px_46px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:p-4">
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-primary">Privacidade</p>
              <h2 className="text-[15px] font-semibold leading-snug text-white sm:text-base">Escolha como o app pode usar cookies e integrações opcionais.</h2>
              <p className="max-w-[52rem] text-[13px] leading-5 text-white/62 sm:text-sm sm:leading-6">
                Você pode permitir anúncios e integrações de marketing para melhorar a experiência. Os recursos essenciais do Hora do Treino continuam funcionando mesmo sem os consentimentos não essenciais.
              </p>
            </div>

            {isCustomizing ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <ConsentToggleCard
                  title="Ads"
                  description="Permite Google AdSense e anúncios opcionais."
                  checked={draftPreferences.ads}
                  onChange={(checked) => setDraftPreferences((current) => ({ ...current, ads: checked }))}
                />
                <ConsentToggleCard
                  title="Marketing"
                  description="Permite Meta Pixel e LeadLovers para remarketing e automações."
                  checked={draftPreferences.marketing}
                  onChange={(checked) => setDraftPreferences((current) => ({ ...current, marketing: checked }))}
                />
              </div>
            ) : null}

            <div className="mt-4 flex flex-nowrap items-center gap-1.5 overflow-x-auto no-scrollbar">
              {isCustomizing ? (
                <>
                  <Button onClick={saveCustomPreferences} className="min-h-9 shrink-0 rounded-xl px-3 text-[12px]">Salvar escolhas</Button>
                  <Button variant="secondary" onClick={() => setIsCustomizing(false)} className="min-h-9 shrink-0 rounded-xl px-3 text-[12px]">
                    Voltar
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={acceptAll} className="min-h-9 shrink-0 rounded-xl px-3 text-[12px]">Aceitar tudo</Button>
                  <Button variant="secondary" onClick={rejectNonEssential} className="min-h-9 shrink-0 rounded-xl !border-transparent !bg-transparent px-2.5 text-[12px] text-white/50 shadow-none hover:!bg-transparent hover:text-white/70">
                    Recusar
                  </Button>
                  <Button variant="ghost" onClick={openCustomization} className="min-h-9 shrink-0 rounded-xl px-2.5 text-[12px] text-white/70">
                    Personalizar
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

    </ConsentContext.Provider>
  );
}

function ConsentManagedScripts({
  canUseAds,
  canUseMarketing
}: {
  canUseAds: boolean;
  canUseMarketing: boolean;
}) {
  return (
    <>
      {canUseAds ? (
        <Script
          id="google-adsense"
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1213559545344901"
          crossOrigin="anonymous"
          strategy="afterInteractive"
          onLoad={() => {
            window.__googleAdsenseScriptLoaded = true;
            window.dispatchEvent(new CustomEvent("google-adsense:loaded"));
            clientLogInfo("ADS SCRIPT LOADED", {
              script_id: "google-adsense",
              src: "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1213559545344901"
            });
          }}
          onError={(error) => {
            clientLogError("ADS SCRIPT LOAD ERROR", error);
          }}
        />
      ) : null}

      {canUseMarketing ? (
        <>
          <Script id="facebook-pixel" strategy="afterInteractive">
            {`
              !function(f,b,e,v,n,t,s)
              {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
              n.callMethod.apply(n,arguments):n.queue.push(arguments)};
              if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
              n.queue=[];t=b.createElement(e);t.async=!0;
              t.src=v;s=b.getElementsByTagName(e)[0];
              s.parentNode.insertBefore(t,s)}(window, document,'script',
              'https://connect.facebook.net/en_US/fbevents.js');
              fbq('init', '${FACEBOOK_PIXEL_ID}');
              fbq('track', 'PageView');
            `}
          </Script>
          <Suspense fallback={null}>
            <MetaPixelPageViewTracker />
          </Suspense>
        </>
      ) : null}

    </>
  );
}

function ConsentToggleCard({
  title,
  description,
  checked,
  onChange
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[24px] border border-white/10 bg-white/[0.03] p-4">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 h-4 w-4 rounded border-white/20 accent-[#22c55e]"
      />
      <span className="space-y-1">
        <span className="block text-sm font-semibold text-white">{title}</span>
        <span className="block text-sm leading-6 text-white/62">{description}</span>
      </span>
    </label>
  );
}
