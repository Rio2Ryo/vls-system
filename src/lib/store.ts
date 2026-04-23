import { ABTest, ABAssignment, AdminUser, AnalyticsRecord, AuditLog, BehaviorEvent, Campaign, ChatMessage, Company, DEFAULT_RETENTION_POLICY, DEFAULT_THEME_CONFIG, DEFAULT_WATERMARK_CONFIG, EventData, EventTemplate, FaceGroup, FrameTemplate, InvoiceData, MyPortalSession, NotificationLog, NpsResponse, OfferInteraction, Participant, PricingPlan, Purchase, PushSubscriptionRecord, PushLog, RetentionPolicy, ScheduledTask, Segment, ShareEvent, SponsorReportShare, SurveyQuestion, TaskExecutionLog, Tenant, ThemeConfig, VideoPlayRecord, WatermarkConfig, WebhookConfig, WebhookLog } from "./types";
import { COMPANIES as DEFAULT_COMPANIES, DEFAULT_FRAME_TEMPLATES, EVENTS as DEFAULT_EVENTS, DEFAULT_SURVEY, TENANTS as DEFAULT_TENANTS } from "./data";
import { csrfHeaders } from "./csrf";
import { fetchWithRetry } from "./fetchWithRetry";

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
  eventTemplates: "vls_event_templates",
  frameTemplates: "vls_frame_templates",
  mySessions: "vls_my_sessions",
  npsResponses: "vls_nps_responses",
  auditLog: "vls_audit_log",
  faceGroups: "vls_face_groups",
  abTests: "vls_ab_tests",
  abAssignments: "vls_ab_assignments",
  behaviorEvents: "vls_behavior_events",
  offerInteractions: "vls_offer_interactions",
  scheduledTasks: "vls_scheduled_tasks",
  taskExecutionLogs: "vls_task_execution_logs",
  adminUsers: "vls_admin_users",
  pricingPlans: "vls_pricing_plans",
  purchases: "vls_purchases",
  pushSubscriptions: "vls_push_subscriptions",
  pushLogs: "vls_push_logs",
  segments: "vls_segments",
  campaigns: "vls_campaigns",
  reportShares: "vls_report_shares",
  retentionPolicy: "vls_retention_policy",
  watermarkConfigs: "vls_watermark_configs",
  themeConfigs: "vls_theme_configs",
  chatMessages: "vls_chat_messages",
  shareEvents: "vls_share_events",
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

  fetchWithRetry("/api/db", {
    method: "PUT",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ key, value }),
  }, { retries: 3, timeout: 8000, backoff: 500 }).catch((err) => {
    // All retries exhausted — log error and queue for sync when back online
    console.error(`[persistToD1] Failed to sync key "${key}" after retries:`, err);
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
  const res = await fetchWithRetry("/api/db", undefined, { retries: 2, timeout: 8000 });
  if (!res.ok) return;
  const data = await res.json() as Record<string, string>;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && value.length > 0) {
      localStorage.setItem(key, value);
    }
  }
}

/**
 * Force-sync from D1 via /api/d1-sync, overwriting localStorage with D1 data.
 * Use this when D1 is the source of truth and stale localStorage must be discarded.
 * Returns true on success, false on failure.
 */
export async function syncFromD1(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (window.localStorage.getItem("__skip_d1_sync")) return false;
  try {
    const res = await fetchWithRetry("/api/d1-sync", undefined, { retries: 2, timeout: 10000 });
    if (!res.ok) return false;
    const data = await res.json() as Record<string, string>;
    for (const [key, value] of Object.entries(data)) {
      if (typeof value === "string" && value.length > 0) {
        localStorage.setItem(key, value);
      }
    }
    return true;
  } catch (err) {
    console.error("[syncFromD1] Failed to sync from D1:", err);
    return false;
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

export function getEventsByStatus(status: EventData["status"]): EventData[] {
  return getStoredEvents().filter((e) => (e.status || "preparing") === status);
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

export function getParticipantByCheckinToken(token: string): Participant | null {
  return getStoredParticipants().find((p) => p.checkinToken === token) || null;
}

/** Ensure every participant in the store has a checkinToken. Assign missing ones. */
export function ensureCheckinTokens(): number {
  const all = getStoredParticipants();
  let count = 0;
  const updated = all.map((p) => {
    if (p.checkinToken) return p;
    count++;
    return { ...p, checkinToken: generateCheckinToken() };
  });
  if (count > 0) setStoredParticipants(updated);
  return count;
}

/** Generate a short unique token for check-in QR codes. */
export function generateCheckinToken(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 12);
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

export function setStoredNotificationLog(logs: NotificationLog[]): void {
  safeSet(KEYS.notificationLog, logs);
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

// --- Event Templates ---
export function getStoredTemplates(): EventTemplate[] {
  return safeGet(KEYS.eventTemplates, []);
}

export function setStoredTemplates(templates: EventTemplate[]): void {
  safeSet(KEYS.eventTemplates, templates);
}

export function getTemplatesForTenant(tenantId: string): EventTemplate[] {
  return getStoredTemplates().filter((t) => t.tenantId === tenantId);
}

// --- Frame Templates ---
export function getStoredFrameTemplates(): FrameTemplate[] {
  const frames = safeGet<FrameTemplate[]>(KEYS.frameTemplates, DEFAULT_FRAME_TEMPLATES);
  return frames.length > 0 ? frames : DEFAULT_FRAME_TEMPLATES;
}

export function setStoredFrameTemplates(frames: FrameTemplate[]): void {
  const normalized = frames.length > 0 ? frames : DEFAULT_FRAME_TEMPLATES;
  safeSet(KEYS.frameTemplates, normalized);
}

export function getActiveFrameTemplate(): FrameTemplate {
  const frames = getStoredFrameTemplates();
  return frames.find((frame) => frame.isActive) || frames[0] || DEFAULT_FRAME_TEMPLATES[0];
}

export function getFrameTemplateForEvent(eventId?: string | null): FrameTemplate {
  if (!eventId) return getActiveFrameTemplate();
  const event = getStoredEvents().find((e) => e.id === eventId);
  if (event?.frameTemplateId) {
    const frames = getStoredFrameTemplates();
    const match = frames.find((frame) => frame.id === event.frameTemplateId);
    if (match) return match;
  }
  return getActiveFrameTemplate();
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

// --- My Portal Sessions ---
export function getStoredMySessions(): MyPortalSession[] {
  return safeGet(KEYS.mySessions, []);
}

export function setStoredMySessions(sessions: MyPortalSession[]): void {
  safeSet(KEYS.mySessions, sessions);
}

// --- Sponsor Portal Login ---
export function getCompanyByPortalLogin(companyId: string, password: string): Company | null {
  const companies = getStoredCompanies();
  const company = companies.find((c) => c.id === companyId);
  if (!company || !company.portalPassword) return null;
  if (company.portalPassword !== password) return null;
  return company;
}

// --- NPS Responses ---
export function getStoredNpsResponses(): NpsResponse[] {
  return safeGet(KEYS.npsResponses, []);
}

export function setStoredNpsResponses(responses: NpsResponse[]): void {
  safeSet(KEYS.npsResponses, responses);
}

export function addNpsResponse(response: NpsResponse): void {
  const responses = getStoredNpsResponses();
  responses.push(response);
  safeSet(KEYS.npsResponses, responses);
}

export function updateNpsResponse(token: string, update: Partial<NpsResponse>): boolean {
  const responses = getStoredNpsResponses();
  const idx = responses.findIndex((r) => r.token === token);
  if (idx === -1) return false;
  responses[idx] = { ...responses[idx], ...update };
  safeSet(KEYS.npsResponses, responses);
  return true;
}

export function getNpsForEvent(eventId: string): NpsResponse[] {
  return getStoredNpsResponses().filter((r) => r.eventId === eventId);
}

export function getNpsForTenant(tenantId: string): NpsResponse[] {
  const tenantEventIds = new Set(getEventsForTenant(tenantId).map((e) => e.id));
  return getStoredNpsResponses().filter((r) => tenantEventIds.has(r.eventId));
}

// --- Audit Log ---
export function getStoredAuditLogs(): AuditLog[] {
  return safeGet<AuditLog[]>(KEYS.auditLog, []);
}

export function setStoredAuditLogs(logs: AuditLog[]): void {
  safeSet(KEYS.auditLog, logs);
}

export function addAuditLog(log: AuditLog): void {
  const logs = getStoredAuditLogs();
  logs.unshift(log); // newest first
  // Keep last 1000 entries to prevent localStorage bloat
  if (logs.length > 1000) logs.length = 1000;
  safeSet(KEYS.auditLog, logs);
}

export function getAuditLogsForTenant(tenantId: string): AuditLog[] {
  return getStoredAuditLogs().filter((l) => l.tenantId === tenantId);
}

// --- Face Groups ---
export function getFaceGroups(eventId: string): FaceGroup[] {
  const all = safeGet<Record<string, FaceGroup[]>>(KEYS.faceGroups, {});
  return all[eventId] || [];
}

export function setFaceGroups(eventId: string, groups: FaceGroup[]): void {
  const all = safeGet<Record<string, FaceGroup[]>>(KEYS.faceGroups, {});
  all[eventId] = groups;
  safeSet(KEYS.faceGroups, all);
}

// --- A/B Tests ---
export function getStoredABTests(): ABTest[] {
  return safeGet<ABTest[]>(KEYS.abTests, []);
}

export function setStoredABTests(tests: ABTest[]): void {
  safeSet(KEYS.abTests, tests);
}

export function addABTest(test: ABTest): void {
  const tests = getStoredABTests();
  tests.push(test);
  safeSet(KEYS.abTests, tests);
}

export function updateABTest(testId: string, update: Partial<ABTest>): void {
  const tests = getStoredABTests();
  const idx = tests.findIndex((t) => t.id === testId);
  if (idx !== -1) {
    tests[idx] = { ...tests[idx], ...update };
    safeSet(KEYS.abTests, tests);
  }
}

export function getABTestsForTenant(tenantId: string): ABTest[] {
  return getStoredABTests().filter((t) => t.tenantId === tenantId);
}

export function getStoredABAssignments(): ABAssignment[] {
  return safeGet<ABAssignment[]>(KEYS.abAssignments, []);
}

export function addABAssignment(assignment: ABAssignment): void {
  const assignments = getStoredABAssignments();
  assignments.push(assignment);
  if (assignments.length > 5000) assignments.splice(0, assignments.length - 5000);
  safeSet(KEYS.abAssignments, assignments);
}

export function getABAssignmentsForTest(testId: string): ABAssignment[] {
  return getStoredABAssignments().filter((a) => a.testId === testId);
}

export function updateABAssignment(assignmentId: string, update: Partial<ABAssignment>): void {
  const assignments = getStoredABAssignments();
  const idx = assignments.findIndex((a) => a.id === assignmentId);
  if (idx !== -1) {
    assignments[idx] = { ...assignments[idx], ...update };
    safeSet(KEYS.abAssignments, assignments);
  }
}

// --- Behavior Events ---
export function getStoredBehaviorEvents(): BehaviorEvent[] {
  return safeGet<BehaviorEvent[]>(KEYS.behaviorEvents, []);
}

export function addBehaviorEvent(event: BehaviorEvent): void {
  const events = getStoredBehaviorEvents();
  events.push(event);
  // Keep last 5000 entries to prevent bloat
  if (events.length > 5000) events.splice(0, events.length - 5000);
  safeSet(KEYS.behaviorEvents, events);
}

export function setStoredBehaviorEvents(events: BehaviorEvent[]): void {
  safeSet(KEYS.behaviorEvents, events);
}

export function getBehaviorEventsForEvent(eventId: string): BehaviorEvent[] {
  return getStoredBehaviorEvents().filter((e) => e.eventId === eventId);
}

// --- Offer Interactions ---
export function getStoredOfferInteractions(): OfferInteraction[] {
  return safeGet<OfferInteraction[]>(KEYS.offerInteractions, []);
}

export function addOfferInteraction(interaction: OfferInteraction): void {
  const interactions = getStoredOfferInteractions();
  interactions.push(interaction);
  if (interactions.length > 5000) interactions.splice(0, interactions.length - 5000);
  safeSet(KEYS.offerInteractions, interactions);
}

export function setStoredOfferInteractions(interactions: OfferInteraction[]): void {
  safeSet(KEYS.offerInteractions, interactions);
}

export function getOfferInteractionsForEvent(eventId: string): OfferInteraction[] {
  return getStoredOfferInteractions().filter((i) => i.eventId === eventId);
}

export function getOfferInteractionsForCompany(companyId: string): OfferInteraction[] {
  return getStoredOfferInteractions().filter((i) => i.companyId === companyId);
}

// --- Scheduled Tasks ---
export function getStoredScheduledTasks(): ScheduledTask[] {
  return safeGet(KEYS.scheduledTasks, []);
}

export function setStoredScheduledTasks(tasks: ScheduledTask[]): void {
  safeSet(KEYS.scheduledTasks, tasks);
}

export function addScheduledTask(task: ScheduledTask): void {
  const tasks = getStoredScheduledTasks();
  tasks.push(task);
  safeSet(KEYS.scheduledTasks, tasks);
}

export function updateScheduledTask(id: string, updates: Partial<ScheduledTask>): void {
  const tasks = getStoredScheduledTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], ...updates };
  safeSet(KEYS.scheduledTasks, tasks);
}

export function deleteScheduledTask(id: string): void {
  const tasks = getStoredScheduledTasks().filter((t) => t.id !== id);
  safeSet(KEYS.scheduledTasks, tasks);
}

export function getScheduledTasksForEvent(eventId: string): ScheduledTask[] {
  return getStoredScheduledTasks().filter((t) => t.eventId === eventId);
}

export function getPendingScheduledTasks(): ScheduledTask[] {
  const now = Date.now();
  return getStoredScheduledTasks().filter(
    (t) => t.status === "pending" && t.scheduledAt <= now
  );
}

// --- Task Execution Logs ---
export function getStoredTaskExecutionLogs(): TaskExecutionLog[] {
  return safeGet(KEYS.taskExecutionLogs, []);
}

export function addTaskExecutionLog(log: TaskExecutionLog): void {
  const logs = getStoredTaskExecutionLogs();
  logs.push(log);
  if (logs.length > 2000) logs.splice(0, logs.length - 2000);
  safeSet(KEYS.taskExecutionLogs, logs);
}

export function getTaskExecutionLogsForTask(taskId: string): TaskExecutionLog[] {
  return getStoredTaskExecutionLogs().filter((l) => l.taskId === taskId);
}

// --- Admin Users (RBAC) ---
export function getStoredAdminUsers(): AdminUser[] {
  return safeGet(KEYS.adminUsers, []);
}

export function setStoredAdminUsers(users: AdminUser[]): void {
  safeSet(KEYS.adminUsers, users);
}

export function addAdminUser(user: AdminUser): void {
  const users = getStoredAdminUsers();
  users.push(user);
  safeSet(KEYS.adminUsers, users);
}

export function updateAdminUser(id: string, updates: Partial<AdminUser>): void {
  const users = getStoredAdminUsers();
  const idx = users.findIndex((u) => u.id === id);
  if (idx === -1) return;
  users[idx] = { ...users[idx], ...updates };
  safeSet(KEYS.adminUsers, users);
}

export function deleteAdminUser(id: string): void {
  const users = getStoredAdminUsers().filter((u) => u.id !== id);
  safeSet(KEYS.adminUsers, users);
}

export function getAdminUserByPassword(password: string): AdminUser | null {
  return getStoredAdminUsers().find((u) => u.password === password && u.isActive) || null;
}

export function getAdminUsersForTenant(tenantId: string): AdminUser[] {
  return getStoredAdminUsers().filter((u) => u.tenantId === tenantId);
}

// --- Pricing Plans ---
const DEFAULT_PRICING_PLANS: PricingPlan[] = [
  {
    id: "plan-free",
    name: "お試しプラン",
    description: "写真3枚まで無料ダウンロード",
    priceYen: 0,
    photoCount: 3,
    features: ["低画質プレビュー", "透かし付き", "3枚まで選択可"],
    isActive: true,
    sortOrder: 0,
    createdAt: Date.now(),
  },
  {
    id: "plan-basic",
    name: "ベーシックプラン",
    description: "写真10枚セット",
    priceYen: 1980,
    photoCount: 10,
    features: ["高画質ダウンロード", "透かしなし", "10枚まで選択可", "フレーム合成対応"],
    isActive: true,
    sortOrder: 1,
    createdAt: Date.now(),
  },
  {
    id: "plan-premium",
    name: "プレミアムプラン",
    description: "全写真パック — イベント写真すべてダウンロード",
    priceYen: 3980,
    photoCount: 0,
    features: ["全写真ダウンロード", "高画質・透かしなし", "フレーム合成対応", "アルバム共有リンク", "30日間再ダウンロード可"],
    isActive: true,
    sortOrder: 2,
    createdAt: Date.now(),
  },
];

export function getStoredPricingPlans(): PricingPlan[] {
  return safeGet(KEYS.pricingPlans, DEFAULT_PRICING_PLANS);
}

export function setStoredPricingPlans(plans: PricingPlan[]): void {
  safeSet(KEYS.pricingPlans, plans);
}

export function addPricingPlan(plan: PricingPlan): void {
  const plans = getStoredPricingPlans();
  plans.push(plan);
  safeSet(KEYS.pricingPlans, plans);
}

export function updatePricingPlan(id: string, updates: Partial<PricingPlan>): void {
  const plans = getStoredPricingPlans();
  const idx = plans.findIndex((p) => p.id === id);
  if (idx === -1) return;
  plans[idx] = { ...plans[idx], ...updates };
  safeSet(KEYS.pricingPlans, plans);
}

export function deletePricingPlan(id: string): void {
  const plans = getStoredPricingPlans().filter((p) => p.id !== id);
  safeSet(KEYS.pricingPlans, plans);
}

// --- Purchases ---
export function getStoredPurchases(): Purchase[] {
  return safeGet(KEYS.purchases, []);
}

export function setStoredPurchases(purchases: Purchase[]): void {
  safeSet(KEYS.purchases, purchases);
}

export function addPurchase(purchase: Purchase): void {
  const purchases = getStoredPurchases();
  purchases.push(purchase);
  if (purchases.length > 5000) purchases.splice(0, purchases.length - 5000);
  safeSet(KEYS.purchases, purchases);
}

export function updatePurchase(id: string, updates: Partial<Purchase>): void {
  const purchases = getStoredPurchases();
  const idx = purchases.findIndex((p) => p.id === id);
  if (idx === -1) return;
  purchases[idx] = { ...purchases[idx], ...updates };
  safeSet(KEYS.purchases, purchases);
}

export function getPurchasesForEvent(eventId: string): Purchase[] {
  return getStoredPurchases().filter((p) => p.eventId === eventId);
}

export function getPurchasesForTenant(tenantId: string): Purchase[] {
  return getStoredPurchases().filter((p) => p.tenantId === tenantId);
}

// --- Push Subscriptions ---
export function getStoredPushSubscriptions(): PushSubscriptionRecord[] {
  return safeGet(KEYS.pushSubscriptions, []);
}

export function setStoredPushSubscriptions(subs: PushSubscriptionRecord[]): void {
  safeSet(KEYS.pushSubscriptions, subs);
}

export function addPushSubscription(sub: PushSubscriptionRecord): void {
  const subs = getStoredPushSubscriptions();
  // Deduplicate by endpoint
  const existing = subs.findIndex((s) => s.endpoint === sub.endpoint);
  if (existing !== -1) {
    subs[existing] = sub;
  } else {
    subs.push(sub);
  }
  if (subs.length > 10000) subs.splice(0, subs.length - 10000);
  safeSet(KEYS.pushSubscriptions, subs);
}

export function removePushSubscription(endpoint: string): void {
  const subs = getStoredPushSubscriptions().filter((s) => s.endpoint !== endpoint);
  safeSet(KEYS.pushSubscriptions, subs);
}

// --- Push Logs ---
export function getStoredPushLogs(): PushLog[] {
  return safeGet(KEYS.pushLogs, []);
}

export function addPushLog(log: PushLog): void {
  const logs = getStoredPushLogs();
  logs.unshift(log);
  if (logs.length > 500) logs.length = 500;
  safeSet(KEYS.pushLogs, logs);
}

export function setStoredPushLogs(logs: PushLog[]): void {
  safeSet(KEYS.pushLogs, logs);
}

// --- Video Plays setter ---
export function setStoredVideoPlays(plays: VideoPlayRecord[]): void {
  safeSet(KEYS.videoPlays, plays);
}

// --- Analytics setter ---
export function setStoredAnalytics(records: AnalyticsRecord[]): void {
  safeSet(KEYS.analytics, records);
}

// --- Segments ---
export function getStoredSegments(): Segment[] {
  return safeGet(KEYS.segments, []);
}

export function setStoredSegments(segments: Segment[]): void {
  safeSet(KEYS.segments, segments);
}

export function addSegment(segment: Segment): void {
  const segments = getStoredSegments();
  segments.push(segment);
  safeSet(KEYS.segments, segments);
}

export function updateSegment(id: string, update: Partial<Segment>): void {
  const segments = getStoredSegments();
  const idx = segments.findIndex((s) => s.id === id);
  if (idx !== -1) {
    segments[idx] = { ...segments[idx], ...update };
    safeSet(KEYS.segments, segments);
  }
}

export function deleteSegment(id: string): void {
  const segments = getStoredSegments().filter((s) => s.id !== id);
  safeSet(KEYS.segments, segments);
}

// --- Campaigns ---
export function getStoredCampaigns(): Campaign[] {
  return safeGet(KEYS.campaigns, []);
}

export function addCampaign(campaign: Campaign): void {
  const campaigns = getStoredCampaigns();
  campaigns.unshift(campaign);
  if (campaigns.length > 500) campaigns.length = 500;
  safeSet(KEYS.campaigns, campaigns);
}

// --- Sponsor Report Shares ---
export function getStoredReportShares(): SponsorReportShare[] {
  return safeGet<SponsorReportShare[]>(KEYS.reportShares, []);
}
export function addReportShare(share: SponsorReportShare): void {
  const shares = getStoredReportShares();
  shares.unshift(share);
  if (shares.length > 200) shares.length = 200;
  safeSet(KEYS.reportShares, shares);
}
export function setStoredReportShares(shares: SponsorReportShare[]): void {
  safeSet(KEYS.reportShares, shares);
}

// --- Retention Policy ---
export function getRetentionPolicy(): RetentionPolicy {
  return safeGet<RetentionPolicy>(KEYS.retentionPolicy, DEFAULT_RETENTION_POLICY);
}
export function setRetentionPolicy(policy: RetentionPolicy): void {
  safeSet(KEYS.retentionPolicy, policy);
}

/** Run data cleanup based on retention policy. Returns { key: deletedCount } map. */
export function runDataCleanup(): Record<string, number> {
  const policy = getRetentionPolicy();
  const now = Date.now();
  const results: Record<string, number> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purge = (key: string, getter: () => any[], setter: (items: any[]) => void, days: number, tsField = "timestamp") => {
    if (days === 0) { results[key] = 0; return; }
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const items = getter();
    const kept = items.filter((item) => {
      const ts = item[tsField] as number | undefined;
      return ts ? ts >= cutoff : true;
    });
    const deleted = items.length - kept.length;
    if (deleted > 0) setter(kept);
    results[key] = deleted;
  };

  purge(KEYS.analytics, getStoredAnalytics, setStoredAnalytics, policy.analytics);
  purge(KEYS.videoPlays, getStoredVideoPlays, setStoredVideoPlays, policy.videoPlays);
  purge(KEYS.behaviorEvents, getStoredBehaviorEvents, setStoredBehaviorEvents, policy.behaviorEvents);
  purge(KEYS.offerInteractions, getStoredOfferInteractions, setStoredOfferInteractions, policy.offerInteractions);
  purge(KEYS.auditLog, getStoredAuditLogs, setStoredAuditLogs, policy.auditLog);
  purge(KEYS.notificationLog, getStoredNotificationLog, setStoredNotificationLog, policy.notificationLog);
  purge(KEYS.pushLogs, getStoredPushLogs, setStoredPushLogs, policy.pushLogs);
  purge(KEYS.npsResponses, getStoredNpsResponses, setStoredNpsResponses, policy.npsResponses, "sentAt");

  // Update last cleanup timestamp
  setRetentionPolicy({ ...policy, lastCleanupAt: now });

  return results;
}

/** Preview how many records would be deleted without actually deleting. */
export function previewDataCleanup(): Record<string, { total: number; expired: number }> {
  const policy = getRetentionPolicy();
  const now = Date.now();
  const results: Record<string, { total: number; expired: number }> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const preview = (key: string, getter: () => any[], days: number, tsField = "timestamp") => {
    const items = getter();
    if (days === 0) { results[key] = { total: items.length, expired: 0 }; return; }
    const cutoff = now - days * 24 * 60 * 60 * 1000;
    const expired = items.filter((item) => {
      const ts = item[tsField] as number | undefined;
      return ts ? ts < cutoff : false;
    }).length;
    results[key] = { total: items.length, expired };
  };

  preview(KEYS.analytics, getStoredAnalytics, policy.analytics);
  preview(KEYS.videoPlays, getStoredVideoPlays, policy.videoPlays);
  preview(KEYS.behaviorEvents, getStoredBehaviorEvents, policy.behaviorEvents);
  preview(KEYS.offerInteractions, getStoredOfferInteractions, policy.offerInteractions);
  preview(KEYS.auditLog, getStoredAuditLogs, policy.auditLog);
  preview(KEYS.notificationLog, getStoredNotificationLog, policy.notificationLog);
  preview(KEYS.pushLogs, getStoredPushLogs, policy.pushLogs);
  preview(KEYS.npsResponses, getStoredNpsResponses, policy.npsResponses, "sentAt");

  return results;
}

// --- Watermark Configs ---
export function getStoredWatermarkConfigs(): WatermarkConfig[] {
  return safeGet<WatermarkConfig[]>(KEYS.watermarkConfigs, []);
}
export function setStoredWatermarkConfigs(configs: WatermarkConfig[]): void {
  safeSet(KEYS.watermarkConfigs, configs);
}
export function getWatermarkConfig(tenantId: string): WatermarkConfig {
  const configs = getStoredWatermarkConfigs();
  const found = configs.find((c) => c.tenantId === tenantId);
  return found || { tenantId, ...DEFAULT_WATERMARK_CONFIG };
}
export function setWatermarkConfig(config: WatermarkConfig): void {
  const configs = getStoredWatermarkConfigs();
  const idx = configs.findIndex((c) => c.tenantId === config.tenantId);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  setStoredWatermarkConfigs(configs);
}

// --- Theme Configs ---
function getStoredThemeConfigs(): ThemeConfig[] {
  return safeGet(KEYS.themeConfigs, []);
}
function setStoredThemeConfigs(configs: ThemeConfig[]): void {
  safeSet(KEYS.themeConfigs, configs);
}
export function getThemeConfig(tenantId: string): ThemeConfig {
  const configs = getStoredThemeConfigs();
  const found = configs.find((c) => c.tenantId === tenantId);
  return found || { tenantId, ...DEFAULT_THEME_CONFIG };
}
export function setThemeConfig(config: ThemeConfig): void {
  const configs = getStoredThemeConfigs();
  const idx = configs.findIndex((c) => c.tenantId === config.tenantId);
  if (idx >= 0) {
    configs[idx] = config;
  } else {
    configs.push(config);
  }
  setStoredThemeConfigs(configs);
}

// --- Share Events ---
export function getStoredShareEvents(): ShareEvent[] {
  return safeGet(KEYS.shareEvents, []);
}
export function addShareEvent(ev: ShareEvent): void {
  const all = getStoredShareEvents();
  all.push(ev);
  const trimmed = all.length > 1000 ? all.slice(-1000) : all;
  safeSet(KEYS.shareEvents, trimmed);
}
export function getShareEventsForEvent(eventId: string): ShareEvent[] {
  return getStoredShareEvents().filter((e) => e.eventId === eventId);
}

// --- Chat Messages ---
export function getStoredChatMessages(): ChatMessage[] {
  return safeGet(KEYS.chatMessages, []);
}
export function setStoredChatMessages(messages: ChatMessage[]): void {
  safeSet(KEYS.chatMessages, messages);
}
export function addChatMessage(msg: ChatMessage): void {
  const all = getStoredChatMessages();
  all.push(msg);
  // Keep last 500 messages max
  const trimmed = all.length > 500 ? all.slice(-500) : all;
  setStoredChatMessages(trimmed);
}
export function getChatMessagesForRoom(roomId: string): ChatMessage[] {
  return getStoredChatMessages().filter((m) => m.roomId === roomId);
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
