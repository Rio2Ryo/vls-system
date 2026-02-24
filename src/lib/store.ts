import { AnalyticsRecord, Company, EventData, SurveyQuestion } from "./types";
import { COMPANIES as DEFAULT_COMPANIES, EVENTS as DEFAULT_EVENTS, DEFAULT_SURVEY } from "./data";

const KEYS = {
  events: "vls_admin_events",
  companies: "vls_admin_companies",
  survey: "vls_admin_survey",
  analytics: "vls_analytics",
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
  localStorage.setItem(key, JSON.stringify(value));
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

// --- Analytics ---
export function getStoredAnalytics(): AnalyticsRecord[] {
  return safeGet(KEYS.analytics, []);
}

export function addAnalyticsRecord(record: AnalyticsRecord): void {
  const records = getStoredAnalytics();
  records.push(record);
  safeSet(KEYS.analytics, records);
}

export function updateAnalyticsRecord(id: string, updates: Partial<AnalyticsRecord>): void {
  const records = getStoredAnalytics();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) return;
  records[idx] = { ...records[idx], ...updates };
  if (updates.stepsCompleted) {
    records[idx].stepsCompleted = { ...records[idx].stepsCompleted, ...updates.stepsCompleted };
  }
  safeSet(KEYS.analytics, records);
}

export function clearAnalytics(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.analytics);
}

// --- Reset to defaults ---
export function resetToDefaults(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.events);
  localStorage.removeItem(KEYS.companies);
  localStorage.removeItem(KEYS.survey);
}
