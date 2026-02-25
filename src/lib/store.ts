import { AnalyticsRecord, Company, EventData, SurveyQuestion, VideoPlayRecord } from "./types";
import { COMPANIES as DEFAULT_COMPANIES, EVENTS as DEFAULT_EVENTS, DEFAULT_SURVEY } from "./data";

const KEYS = {
  events: "vls_admin_events",
  companies: "vls_admin_companies",
  survey: "vls_admin_survey",
  analytics: "vls_analytics",
  videoPlays: "vls_video_plays",
} as const;

function safeGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // QuotaExceededError — silently ignore to prevent page crash
  }
}

// --- Events ---
export function getStoredEvents(): EventData[] {
  return safeGet(KEYS.events, DEFAULT_EVENTS);
}

export function setStoredEvents(events: EventData[]): void {
  safeSet(KEYS.events, events);
}

export function getEventByPassword(password: string): EventData | null {
  const events = getStoredEvents();
  return events.find((e) => e.password === password.toUpperCase()) || null;
}

// --- Companies ---
export function getStoredCompanies(): Company[] {
  return safeGet(KEYS.companies, DEFAULT_COMPANIES);
}

export function setStoredCompanies(companies: Company[]): void {
  safeSet(KEYS.companies, companies);
}

// --- Survey ---
export function getStoredSurvey(): SurveyQuestion[] {
  return safeGet(KEYS.survey, DEFAULT_SURVEY);
}

export function setStoredSurvey(survey: SurveyQuestion[]): void {
  safeSet(KEYS.survey, survey);
}

/** Get survey for a specific event. Falls back to global default if not set. */
export function getSurveyForEvent(eventId: string): SurveyQuestion[] {
  const events = getStoredEvents();
  const event = events.find((e) => e.id === eventId);
  if (event?.surveyQuestions && event.surveyQuestions.length > 0) {
    return event.surveyQuestions;
  }
  return getStoredSurvey();
}

/** Save per-event survey questions. Pass null to revert to global default. */
export function setEventSurvey(eventId: string, questions: SurveyQuestion[] | null): void {
  const events = getStoredEvents();
  const updated = events.map((e) =>
    e.id === eventId
      ? { ...e, surveyQuestions: questions || undefined }
      : e
  );
  setStoredEvents(updated);
}

// --- Analytics ---
export function getStoredAnalytics(): AnalyticsRecord[] {
  return safeGet(KEYS.analytics, []);
}

export function addAnalyticsRecord(record: AnalyticsRecord): void {
  const records = getStoredAnalytics();
  records.push(record);
  safeSet(KEYS.analytics, records);
}

type AnalyticsUpdate = Omit<Partial<AnalyticsRecord>, "stepsCompleted"> & {
  stepsCompleted?: Partial<AnalyticsRecord["stepsCompleted"]>;
};

export function updateAnalyticsRecord(id: string, updates: AnalyticsUpdate): void {
  const records = getStoredAnalytics();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return;
  const original = records[idx];
  records[idx] = { ...original, ...updates } as AnalyticsRecord;
  if (updates.stepsCompleted) {
    records[idx].stepsCompleted = { ...original.stepsCompleted, ...updates.stepsCompleted };
  }
  safeSet(KEYS.analytics, records);
}

export function clearAnalytics(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.analytics);
}

// --- Video Play Records ---
export function getStoredVideoPlays(): VideoPlayRecord[] {
  return safeGet(KEYS.videoPlays, []);
}

export function addVideoPlayRecord(record: VideoPlayRecord): void {
  const records = getStoredVideoPlays();
  records.push(record);
  safeSet(KEYS.videoPlays, records);
}

export function clearVideoPlays(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.videoPlays);
}

// --- Reset to defaults ---
export function resetToDefaults(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.events);
  localStorage.removeItem(KEYS.companies);
  localStorage.removeItem(KEYS.survey);
}
