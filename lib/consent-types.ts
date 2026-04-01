export const CONSENT_SCOPES = ["analytics", "marketing", "ads", "terms_of_use"] as const;
export type ConsentScope = (typeof CONSENT_SCOPES)[number];

export const CMP_CONSENT_SCOPES = ["analytics", "marketing", "ads"] as const;
export type CmpConsentScope = (typeof CMP_CONSENT_SCOPES)[number];

export type ConsentPreferenceMap = Record<CmpConsentScope, boolean>;

export const DEFAULT_CONSENT_PREFERENCES: ConsentPreferenceMap = {
  analytics: false,
  marketing: false,
  ads: false
};
