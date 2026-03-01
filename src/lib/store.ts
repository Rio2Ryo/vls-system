import { AnalyticsRecord, Company, EventData, InvoiceData, NotificationLog, Participant, SurveyQuestion, Tenant, VideoPlayRecord, WebhookConfig, WebhookLog } from "./types";
import { COMPANIES as DEFAULT_COMPANIES, EVENTS as DEFAULT_EVENTS, DEFAULT_SURVEY, TENANTS as DEFAULT_TENANTS } from "./data";
import { csrfHeaders } from "./csrf";

const KEYS = {
  events: "vls_admin_events",
  companies: "vls_admin_companies",
  survey: "vls_admin_survey",
  analytics: "vls_analytics",
  videoPlays: "vls_video_plays",
  tenants: "vls_admin_tenants",
  participants: "vls_participants",
  invoices: "vls_invoices",
  notificationLog: "vls_notification_log",
  webhooks: "vls_webhooks",
  webhookLog: "vls_webhook_log",
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

/** Queue a D1 write in IndexedDB for later sync (called when offline or fetch fails). */
function queueForSync(key: string, value: string): void {
  import("./idb").then(({ addToSyncQueue }) => {
    addToSyncQueue({ key, value, timestamp: Date.now() });
  }).catch(() => {});
}

/** Persist to D1 via API (fire-and-forget). Queues in IndexedDB when offline. Skipped in E2E test mode. */
function persistToD1(key: string, value: string): void {
  if (typeof window !== "undefined" && window.localStorage.getItem("__skip_d1_sync")) return;

  // If clearly offline, queue immediately
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    queueForSync(key, value);
    return;
  }

  fetch("/api/db", {
    method: "PUT",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ key, value }),
  }).catch(() => {
    // Network error — queue for sync when back online
    queueForSync(key, value);
  });
}

function safeSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch {
    // QuotaExceededError — silently ignore to prevent page crash
  }
  // Fire-and-forget D1 persistence
  persistToD1(key, json);
}

/**
 * Fetch all data from D1 and populate localStorage.
 * Called once on app startup by DbSyncProvider.
 */
export async function syncFromDb(): Promise<void> {
  if (typeof window === "undefined") return;
  if (window.localStorage.getItem("__skip_d1_sync")) return;
  try {
    const res = await fetch("/api/db");
    if (!res.ok) return;
    const data = await res.json() as Record<string, string>;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.length > 0) {
        localStorage.setItem(key, value);
      }
    }
  } catch {
    // D1 sync failed — fall back to existing localStorage data
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

export function getEventBySlug(slug: string): EventData | null {
  const events = getStoredEvents();
  return events.find((e) => e.slug === slug.toLowerCase()) || null;
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
  persistToD1(KEYS.analytics, "[]");
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
  persistToD1(KEYS.videoPlays, "[]");
}

// --- Tenants ---
export function getStoredTenants(): Tenant[] {
  return safeGet(KEYS.tenants, DEFAULT_TENANTS);
}

export function setStoredTenants(tenants: Tenant[]): void {
  safeSet(KEYS.tenants, tenants);
}

export function getTenantBySlug(slug: string): Tenant | null {
  return getStoredTenants().find((t) => t.slug === slug.toLowerCase()) || null;
}

// --- Participants ---
export function getStoredParticipants(): Participant[] {
  return safeGet(KEYS.participants, []);
}

export function setStoredParticipants(participants: Participant[]): void {
  safeSet(KEYS.participants, participants);
}

export function getParticipantsForEvent(eventId: string): Participant[] {
  return getStoredParticipants().filter((p) => p.eventId === eventId);
}

// --- Invoices ---
export function getStoredInvoices(): InvoiceData[] {
  return safeGet(KEYS.invoices, []);
}

export function setStoredInvoices(invoices: InvoiceData[]): void {
  safeSet(KEYS.invoices, invoices);
}

// --- Notification Log ---
export function getStoredNotificationLog(): NotificationLog[] {
  return safeGet(KEYS.notificationLog, []);
}

export function addNotificationLog(entry: NotificationLog): void {
  const log = getStoredNotificationLog();
  log.push(entry);
  // Keep last 200 entries
  if (log.length > 200) log.splice(0, log.length - 200);
  safeSet(KEYS.notificationLog, log);
}

export function updateNotificationLog(id: string, update: Partial<NotificationLog>): void {
  const log = getStoredNotificationLog();
  const idx = log.findIndex((e) => e.id === id);
  if (idx !== -1) {
    log[idx] = { ...log[idx], ...update };
    safeSet(KEYS.notificationLog, log);
  }
}

// --- Tenant-scoped data access ---
export function getEventsForTenant(tenantId: string): EventData[] {
  return getStoredEvents().filter((e) => e.tenantId === tenantId);
}

export function getAnalyticsForTenant(tenantId: string): AnalyticsRecord[] {
  const tenantEventIds = new Set(getEventsForTenant(tenantId).map((e) => e.id));
  return getStoredAnalytics().filter((a) => tenantEventIds.has(a.eventId));
}

export function getVideoPlaysForTenant(tenantId: string): VideoPlayRecord[] {
  const tenantEventIds = new Set(getEventsForTenant(tenantId).map((e) => e.id));
  return getStoredVideoPlays().filter((v) => tenantEventIds.has(v.eventId));
}

export function getInvoicesForTenant(tenantId: string): InvoiceData[] {
  return getStoredInvoices().filter((i) => i.tenantId === tenantId);
}

export function getParticipantsForTenant(tenantId: string): Participant[] {
  return getStoredParticipants().filter((p) => p.tenantId === tenantId);
}

// --- Tenant cascade delete ---

/** Summary of what will be (or was) deleted by cascade */
export interface TenantDeleteSummary {
  tenantName: string;
  events: number;
  participants: number;
  invoices: number;
  analytics: number;
  videoPlays: number;
  notifications: number;
}

/** Preview what cascade delete would remove (no mutation) */
export function previewTenantCascade(tenantId: string): TenantDeleteSummary | null {
  const tenants = getStoredTenants();
  const tenant = tenants.find((t) => t.id === tenantId);
  if (!tenant) return null;

  const tenantEventIds = new Set(
    getStoredEvents().filter((e) => e.tenantId === tenantId).map((e) => e.id)
  );

  return {
    tenantName: tenant.name,
    events: tenantEventIds.size,
    participants: getStoredParticipants().filter((p) => p.tenantId === tenantId).length,
    invoices: getStoredInvoices().filter((i) => i.tenantId === tenantId).length,
    analytics: getStoredAnalytics().filter((a) => tenantEventIds.has(a.eventId)).length,
    videoPlays: getStoredVideoPlays().filter((v) => tenantEventIds.has(v.eventId)).length,
    notifications: getStoredNotificationLog().filter((n) => tenantEventIds.has(n.eventId)).length,
  };
}

/**
 * Delete a tenant and all associated child records.
 * Order: collect event IDs → delete children by eventId → delete direct children → delete tenant.
 * All localStorage writes are synchronous; D1 persistence is fire-and-forget per key.
 */
export function deleteTenantCascade(tenantId: string): TenantDeleteSummary | null {
  const summary = previewTenantCascade(tenantId);
  if (!summary) return null;

  // Collect tenant's event IDs for indirect child lookup
  const tenantEventIds = new Set(
    getStoredEvents().filter((e) => e.tenantId === tenantId).map((e) => e.id)
  );

  // 1. Remove analytics records linked to tenant events
  const remainingAnalytics = getStoredAnalytics().filter((a) => !tenantEventIds.has(a.eventId));
  safeSet(KEYS.analytics, remainingAnalytics);

  // 2. Remove video play records linked to tenant events
  const remainingPlays = getStoredVideoPlays().filter((v) => !tenantEventIds.has(v.eventId));
  safeSet(KEYS.videoPlays, remainingPlays);

  // 3. Remove notification logs linked to tenant events
  const remainingNotifs = getStoredNotificationLog().filter((n) => !tenantEventIds.has(n.eventId));
  safeSet(KEYS.notificationLog, remainingNotifs);

  // 4. Remove participants belonging to this tenant
  const remainingParticipants = getStoredParticipants().filter((p) => p.tenantId !== tenantId);
  safeSet(KEYS.participants, remainingParticipants);

  // 5. Remove invoices belonging to this tenant
  const remainingInvoices = getStoredInvoices().filter((i) => i.tenantId !== tenantId);
  safeSet(KEYS.invoices, remainingInvoices);

  // 6. Remove events belonging to this tenant
  const remainingEvents = getStoredEvents().filter((e) => e.tenantId !== tenantId);
  safeSet(KEYS.events, remainingEvents);

  // 7. Remove the tenant itself
  const remainingTenants = getStoredTenants().filter((t) => t.id !== tenantId);
  safeSet(KEYS.tenants, remainingTenants);

  return summary;
}

// --- Webhooks ---
export function getStoredWebhooks(): WebhookConfig[] {
  return safeGet(KEYS.webhooks, []);
}

export function setStoredWebhooks(webhooks: WebhookConfig[]): void {
  safeSet(KEYS.webhooks, webhooks);
}

export function getWebhooksForTenant(tenantId?: string | null): WebhookConfig[] {
  const all = getStoredWebhooks();
  if (!tenantId) return all;
  return all.filter((w) => !w.tenantId || w.tenantId === tenantId);
}

// --- Webhook Log ---
export function getStoredWebhookLog(): WebhookLog[] {
  return safeGet(KEYS.webhookLog, []);
}

export function addWebhookLog(entry: WebhookLog): void {
  const log = getStoredWebhookLog();
  log.push(entry);
  if (log.length > 200) log.splice(0, log.length - 200);
  safeSet(KEYS.webhookLog, log);
}

// --- Reset to defaults ---
export function resetToDefaults(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEYS.events);
  localStorage.removeItem(KEYS.companies);
  localStorage.removeItem(KEYS.survey);
  localStorage.removeItem(KEYS.tenants);
  // Sync defaults back to D1
  persistToD1(KEYS.events, JSON.stringify(DEFAULT_EVENTS));
  persistToD1(KEYS.companies, JSON.stringify(DEFAULT_COMPANIES));
  persistToD1(KEYS.survey, JSON.stringify(DEFAULT_SURVEY));
  persistToD1(KEYS.tenants, JSON.stringify(DEFAULT_TENANTS));
}
