import "server-only";

import {
  CMP_CONSENT_SCOPES,
  CONSENT_SCOPES,
  type ConsentPreferenceMap,
  type ConsentScope,
  DEFAULT_CONSENT_PREFERENCES
} from "@/lib/consent-types";

type SupabaseLike = {
  from: (table: string) => any;
};

type ConsentRow = {
  user_id: string;
  scope: ConsentScope;
  granted: boolean;
  version: string;
  source?: string | null;
  granted_at?: string | null;
  revoked_at?: string | null;
  created_at?: string;
};

export const DEFAULT_CONSENT_VERSION = "2026-03-29";

export function getCurrentConsentVersion() {
  return process.env.CONSENT_VERSION_CURRENT?.trim() || DEFAULT_CONSENT_VERSION;
}

export function createDefaultConsentMap() {
  return Object.fromEntries(CONSENT_SCOPES.map((scope) => [scope, false])) as Record<ConsentScope, boolean>;
}

export function normalizeConsentInput(input?: Partial<Record<ConsentScope, unknown>> | null) {
  if (!input || typeof input !== "object") {
    return {} as Partial<Record<ConsentScope, boolean>>;
  }

  return Object.fromEntries(
    Object.entries(input)
      .filter(([scope]) => CONSENT_SCOPES.includes(scope as ConsentScope))
      .map(([scope, granted]) => [scope, Boolean(granted)])
  ) as Partial<Record<ConsentScope, boolean>>;
}

export function toConsentPreferenceMap(consents: Partial<Record<ConsentScope, boolean>>): ConsentPreferenceMap {
  return {
    ...DEFAULT_CONSENT_PREFERENCES,
    analytics: Boolean(consents.analytics),
    marketing: Boolean(consents.marketing),
    ads: Boolean(consents.ads)
  };
}

export async function getUserConsentRows(supabase: SupabaseLike, userId: string) {
  const { data, error } = (await supabase
    .from("user_consents")
    .select("user_id, scope, granted, version, source, granted_at, revoked_at, created_at")
    .eq("user_id", userId)) as {
    data: ConsentRow[] | null;
    error: { message?: string } | null;
  };

  if (error) {
    throw new Error(error.message || "Não foi possível carregar os consentimentos.");
  }

  return (data ?? []) as ConsentRow[];
}

export async function getUserConsentMap(supabase: SupabaseLike, userId: string) {
  const defaults = createDefaultConsentMap();
  const rows = await getUserConsentRows(supabase, userId);

  for (const row of rows) {
    if (CONSENT_SCOPES.includes(row.scope)) {
      defaults[row.scope] = Boolean(row.granted);
    }
  }

  return defaults;
}

export async function hasStoredConsentDecisions(supabase: SupabaseLike, userId: string) {
  const rows = await getUserConsentRows(supabase, userId);
  return rows.some((row) => CMP_CONSENT_SCOPES.includes(row.scope as (typeof CMP_CONSENT_SCOPES)[number]));
}

export async function saveUserConsents(
  supabase: SupabaseLike,
  userId: string,
  decisions: Partial<Record<ConsentScope, boolean>>,
  {
    source,
    version = getCurrentConsentVersion()
  }: {
    source?: string;
    version?: string;
  } = {}
) {
  const normalizedDecisions = normalizeConsentInput(decisions);
  const scopes = Object.keys(normalizedDecisions) as ConsentScope[];

  if (!scopes.length) {
    return { data: [], error: null };
  }

  const existingRows = await getUserConsentRows(supabase, userId);
  const existingByScope = new Map<ConsentScope, ConsentRow>();

  for (const row of existingRows) {
    existingByScope.set(row.scope, row);
  }

  const now = new Date().toISOString();
  const rows = scopes.map((scope) => {
    const granted = Boolean(normalizedDecisions[scope]);
    const existing = existingByScope.get(scope);
    const shouldResetGrantedAt = granted && (!existing?.granted || !existing?.granted_at);

    return {
      user_id: userId,
      scope,
      granted,
      version,
      source: source ?? existing?.source ?? null,
      granted_at: granted ? (shouldResetGrantedAt ? now : existing?.granted_at ?? now) : existing?.granted_at ?? null,
      revoked_at: granted ? null : now
    };
  });

  return supabase.from("user_consents").upsert(rows, {
    onConflict: "user_id,scope"
  });
}

export async function revokeUserConsent(
  supabase: SupabaseLike,
  userId: string,
  scope: ConsentScope,
  options?: {
    source?: string;
    version?: string;
  }
) {
  return saveUserConsents(
    supabase,
    userId,
    {
      [scope]: false
    },
    options
  );
}
