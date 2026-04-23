export type AnalyticsEventName =
  | "app_session"
  | "home_view"
  | "page_view"
  | "quiz_started"
  | "quiz_start"
  | "signup"
  | "sign_up"
  | "quiz_completed"
  | "workout_generated"
  | "workout_viewed"
  | "viewed_workout"
  | "content_recommendation_generated"
  | "article_click"
  | "cta_click"
  | "cta_clicked"
  | "clicked_cta"
  // Eventos de assinatura premium
  | "premium_page_view"
  | "checkout_started"
  | "purchase"
  // Eventos de escolha de plano
  | "plan_selection_view"
  | "plan_selected";

export const HOME_VIEW_EVENTS: AnalyticsEventName[] = ["home_view", "page_view"];
export const QUIZ_START_EVENTS: AnalyticsEventName[] = ["quiz_started", "quiz_start"];
export const SIGNUP_EVENTS: AnalyticsEventName[] = ["signup", "sign_up", "quiz_completed"];
export const CTA_EVENTS: AnalyticsEventName[] = ["cta_click", "cta_clicked", "clicked_cta"];
export const RETURN_ACTIVITY_EVENTS: AnalyticsEventName[] = [
  "app_session",
  "workout_generated",
  "viewed_workout",
  "workout_viewed",
  "content_recommendation_generated",
  "article_click",
  "cta_click",
  "cta_clicked",
  "clicked_cta"
];

export const ACTIVE_USER_EVENT_NAMES: AnalyticsEventName[] = Array.from(
  new Set([...SIGNUP_EVENTS, ...RETURN_ACTIVITY_EVENTS])
);

export const DASHBOARD_EVENT_NAMES: AnalyticsEventName[] = Array.from(
  new Set([...HOME_VIEW_EVENTS, ...QUIZ_START_EVENTS, ...SIGNUP_EVENTS, ...CTA_EVENTS, ...RETURN_ACTIVITY_EVENTS])
);

export const ANONYMOUS_TRACKABLE_EVENT_NAMES: AnalyticsEventName[] = [
  ...HOME_VIEW_EVENTS,
  ...QUIZ_START_EVENTS
];

const TRACKABLE_EVENT_NAME_SET = new Set<AnalyticsEventName>(DASHBOARD_EVENT_NAMES);
const ANONYMOUS_TRACKABLE_EVENT_NAME_SET = new Set<AnalyticsEventName>(ANONYMOUS_TRACKABLE_EVENT_NAMES);

export function isTrackableAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && TRACKABLE_EVENT_NAME_SET.has(value as AnalyticsEventName);
}

export function isAnonymousTrackableEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === "string" && ANONYMOUS_TRACKABLE_EVENT_NAME_SET.has(value as AnalyticsEventName);
}
