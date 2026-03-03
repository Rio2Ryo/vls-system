// Company tier
export type CompanyTier = "platinum" | "gold" | "silver" | "bronze";

// Interest tags (used for survey + company matching)
export type InterestTag =
  | "education" | "sports" | "food" | "travel"
  | "technology" | "art" | "nature" | "other"
  | "cram_school" | "lessons" | "food_product" | "travel_service"
  | "smartphone" | "camera" | "insurance"
  | "age_0_3" | "age_4_6" | "age_7_9" | "age_10_12" | "age_13_plus";

export interface Company {
  id: string;
  name: string;
  logoUrl: string;
  tier: CompanyTier;
  tags: InterestTag[];
  videos: {
    cm15: string;   // 15s CM URL or YouTube ID
    cm30: string;   // 30s preview CM
    cm60: string;   // 60s full CM
  };
  offerText: string;
  offerUrl: string;
  couponCode?: string;
  portalPassword?: string;  // スポンサーポータルログイン用
}

export type EventStatus = "active" | "expired" | "archived";

export interface EventData {
  id: string;
  name: string;
  date: string;
  venue?: string;
  description: string;
  password: string;
  photos: PhotoData[];
  companyIds?: string[];        // associated company IDs; undefined = all companies
  surveyQuestions?: SurveyQuestion[];  // per-event survey; undefined = use global default
  slug?: string;                // custom URL path: /e/[slug] → auto-login
  notifyEmail?: string;         // admin email for notifications
  tenantId?: string;            // owning tenant ID (multi-tenant)
  // Photo publish period
  publishedAt?: number;         // publish start (Unix ms)
  expiresAt?: number;           // publish deadline (Unix ms), default publishedAt + 7 days
  archivedAt?: number;          // archive timestamp (compressed)
  status?: EventStatus;         // "active" | "expired" | "archived"
}

// Photo scene classification (AI auto-classification)
export type PhotoClassification = "portrait" | "group" | "venue" | "activity" | "other";

export interface PhotoData {
  id: string;
  originalUrl: string;    // high quality
  thumbnailUrl: string;   // low quality for grid
  watermarked: boolean;
  classification?: PhotoClassification;
  classificationConfidence?: number;  // 0.0–1.0
  qualityScore?: number;  // 0–100 AI quality score (blur/exposure/composition)
  faceCount?: number;           // detected face count
  faceDescriptions?: string[];  // description of each detected face
  faceGroupId?: string;         // assigned face group ID
  // Upload optimization metadata
  uploadedAt?: number;        // upload timestamp (Unix ms)
  originalSize?: number;      // original file size in bytes
  optimizedSize?: number;     // post-resize file size in bytes
}

export interface SurveyQuestion {
  id: string;
  question: string;
  options: { label: string; tag: InterestTag }[];
  maxSelections: number;
}

export interface SurveyAnswer {
  questionId: string;
  selectedTags: InterestTag[];
}

// CM matching result
export interface CMMatch {
  platinumCM: Company | null;  // 15s fixed
  matchedCM: Company | null;   // 30s preview + 60s full
  platinumCMs: Company[];      // all platinum companies (for banner display)
}

// Score breakdown for a single company match
export interface MatchScoreBreakdown {
  companyId: string;
  companyName: string;
  tier: CompanyTier;
  totalScore: number;
  breakdown: {
    tagMatchScore: number;
    tagMatchCount: number;
    tagMatchDetails: string[];
    tierBonus: number;
    ageMatchBonus: number;
    categoryBreadth: number;
  };
}

// Extended match result with debug info
export interface CMMatchResult extends CMMatch {
  debug?: {
    allScores: MatchScoreBreakdown[];
    platinumScores: MatchScoreBreakdown[];
    userTags: InterestTag[];
    selectedCompanyIds?: string[];
    reason: string;
  };
}

// Video play record for CM tracking
export interface VideoPlayRecord {
  id: string;
  companyId: string;
  companyName: string;
  videoId: string;
  cmType: "cm15" | "cm30" | "cm60";
  duration: number;         // expected duration in seconds
  watchedSeconds: number;   // actual seconds watched
  completed: boolean;
  timestamp: number;
  eventId: string;
}

// Analytics record for each user session
export interface AnalyticsRecord {
  id: string;
  eventId: string;
  timestamp: number;
  respondentName?: string;
  surveyAnswers?: Record<string, InterestTag[]>;
  stepsCompleted: {
    access: boolean;
    survey: boolean;
    cmViewed: boolean;
    photosViewed: boolean;
    downloaded: boolean;
  };
  matchedCompanyId?: string;
  platinumCompanyId?: string;
}

// Tenant (multi-tenant organization)
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  adminPassword: string;
  plan: "free" | "basic" | "premium" | "enterprise";
  contactEmail: string;
  contactName: string;
  logoUrl?: string;
  primaryColor?: string;  // hex color e.g. "#6EC6FF"
  billingAddress?: string;
  invoicePrefix?: string;
  createdAt: number;
  // License management
  licenseStart?: string;   // ISO date "2026-01-01"
  licenseEnd?: string;     // ISO date "2026-12-31"
  maxEvents?: number;      // max events allowed under license
  isActive?: boolean;      // manually toggle active/inactive
}

// Pre-registered participant (bulk import)
export interface Participant {
  id: string;
  eventId: string;
  tenantId?: string;
  name: string;
  email?: string;
  tags?: InterestTag[];
  registeredAt: number;
  checkedIn: boolean;
  checkedInAt?: number;
}

// Invoice
export interface InvoiceData {
  id: string;
  tenantId: string;
  eventIds: string[];
  issueDate: string;
  dueDate: string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
  status: "draft" | "issued" | "paid";
  notes?: string;
  createdAt: number;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

// Notification log entry
export interface NotificationLog {
  id: string;
  eventId: string;
  type: "registration" | "cm_complete" | "license_expiry";
  to: string;
  subject: string;
  status: "sent" | "failed" | "logged";
  method?: string;
  timestamp: number;
}

// Event template (reusable event settings without instance-specific data)
export interface EventTemplate {
  id: string;
  name: string;               // テンプレート名 (例: "夏祭りテンプレート")
  description?: string;
  venue?: string;
  companyIds?: string[];
  surveyQuestions?: SurveyQuestion[];
  tenantId?: string;
  createdAt: number;
}

// Webhook types
export type WebhookEventType = "checkin" | "download_complete" | "cm_viewed" | "survey_complete";

export interface WebhookConfig {
  id: string;
  tenantId?: string;
  url: string;
  events: WebhookEventType[];
  enabled: boolean;
  secret?: string;
  createdAt: number;
}

// Album share (public photo sharing with 30-day expiry)
export interface AlbumShare {
  id: string;
  token: string;
  eventId: string;
  eventName: string;
  photoIds: string[];
  creatorName: string;
  sponsorIds: string[];       // platinum company IDs for banner display
  matchedCompanyId?: string;  // matched sponsor for offer display
  createdAt: number;
  expiresAt: number;          // 30日有効
  viewCount: number;
}

// My Portal session (magic link auth, 7-day expiry)
export interface MyPortalSession {
  id: string;
  email: string;
  token: string;
  createdAt: number;
  expiresAt: number;   // 7日間有効
}

// NPS (Net Promoter Score) follow-up response
export interface NpsResponse {
  id: string;
  eventId: string;
  eventName: string;
  participantName: string;
  participantEmail: string;
  score?: number;          // 0-10 NPS score (undefined = not yet responded)
  comment?: string;        // free-text feedback
  token: string;           // unique URL token
  sentAt: number;          // email sent timestamp
  respondedAt?: number;    // when participant responded
  expiresAt: number;       // token expiry (7 days)
}

export interface WebhookLog {
  id: string;
  webhookId: string;
  eventType: WebhookEventType;
  url: string;
  status: "success" | "failed";
  statusCode?: number;
  attempts: number;
  payload: string;
  response?: string;
  timestamp: number;
}

// Audit log types
export type AuditAction =
  | "event_create" | "event_update" | "event_delete" | "event_clone"
  | "photo_upload" | "photo_delete" | "photo_classify" | "photo_score"
  | "company_create" | "company_update" | "company_delete"
  | "survey_update"
  | "tenant_create" | "tenant_update" | "tenant_delete"
  | "nps_send"
  | "admin_login" | "admin_logout"
  | "settings_update"
  | "checkin" | "checkin_bulk";

export interface AuditLog {
  id: string;
  timestamp: number;
  action: AuditAction;
  actor: string;
  targetType: string;
  targetId?: string;
  targetName?: string;
  details?: string;
  tenantId?: string;
}

// Face group (grouping photos by detected person)
export interface FaceGroup {
  id: string;
  label: string;          // e.g. "人物A (黒髪ロング)"
  photoIds: string[];     // photo IDs in this group
}

// A/B Test types
export interface ABVariant {
  id: string;
  label: string;             // e.g. "15秒CM", "30秒CM", "60秒CM"
  cmType: "cm15" | "cm30" | "cm60";
  impressions: number;        // times shown
  completions: number;        // times CM completed (watched to end)
  conversions: number;        // times user engaged with offer
}

export interface ABTest {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  variants: ABVariant[];
  status: "active" | "paused" | "completed";
  createdAt: number;
  completedAt?: number;
  eventIds?: string[];        // limit to specific events; undefined = all
  tenantId?: string;
}

export interface ABAssignment {
  id: string;
  testId: string;
  variantId: string;
  userId: string;             // analytics record ID or session ID
  eventId: string;
  companyId: string;
  assignedCmType: "cm15" | "cm30" | "cm60";
  timestamp: number;
  completed: boolean;
  converted: boolean;
}

// Behavior tracking event types
export type BehaviorEventType =
  | "page_view"       // ページ表示
  | "page_leave"      // ページ離脱 (dwell time計測)
  | "tap"             // タップ/クリック
  | "scroll"          // スクロール (depth %)
  | "form_submit";    // フォーム送信

export interface BehaviorEvent {
  id: string;
  eventId: string;          // VLS event ID
  sessionId: string;        // browser session ID
  type: BehaviorEventType;
  page: string;             // e.g. "/", "/survey", "/photos", "/complete"
  timestamp: number;
  // Optional detail fields
  dwellMs?: number;         // milliseconds spent on page (for page_leave)
  scrollDepth?: number;     // 0-100 percentage
  targetElement?: string;   // CSS selector or data-testid of clicked element
  metadata?: Record<string, string>;  // additional key-value pairs
}

// Coupon/Offer tracking
export type OfferActionType = "offer_view" | "offer_click" | "coupon_view" | "coupon_copy" | "coupon_redeem";

export interface OfferInteraction {
  id: string;
  eventId: string;
  sessionId: string;
  companyId: string;
  companyName: string;
  action: OfferActionType;
  couponCode?: string;
  timestamp: number;
  metadata?: Record<string, string>;
}

// Scheduled task types
export type ScheduledTaskType =
  | "photo_publish"     // 写真公開
  | "photo_archive"     // 写真アーカイブ
  | "nps_send"          // NPSアンケート送信
  | "report_generate"   // レポート生成
  | "event_expire";     // イベント期限チェック

export type ScheduledTaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled";

export interface ScheduledTask {
  id: string;
  name: string;
  type: ScheduledTaskType;
  eventId?: string;
  tenantId?: string;
  scheduledAt: number;       // when to execute (Unix ms)
  executedAt?: number;       // actual execution time
  status: ScheduledTaskStatus;
  result?: string;           // execution result/error message
  createdAt: number;
  createdBy: string;
  recurring?: boolean;
  recurringIntervalMs?: number;  // ms between recurring executions (e.g. 86400000 = 24h)
}

export interface TaskExecutionLog {
  id: string;
  taskId: string;
  taskName: string;
  taskType: ScheduledTaskType;
  status: "success" | "failed";
  startedAt: number;
  completedAt: number;
  result: string;
  details?: string;
}

// RBAC (Role-Based Access Control)
export type AdminRole = "super_admin" | "tenant_admin" | "viewer";

export type Permission =
  | "events.read" | "events.write"
  | "companies.read" | "companies.write"
  | "photos.read" | "photos.write"
  | "users.read" | "users.write"
  | "analytics.read"
  | "settings.write"
  | "import.write";

export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
  super_admin: [
    "events.read", "events.write",
    "companies.read", "companies.write",
    "photos.read", "photos.write",
    "users.read", "users.write",
    "analytics.read",
    "settings.write",
    "import.write",
  ],
  tenant_admin: [
    "events.read", "events.write",
    "companies.read", "companies.write",
    "photos.read", "photos.write",
    "users.read",
    "analytics.read",
    "settings.write",
    "import.write",
  ],
  viewer: [
    "events.read",
    "companies.read",
    "photos.read",
    "users.read",
    "analytics.read",
  ],
};

// Participant engagement score (weighted composite)
export interface EngagementScore {
  id: string;
  eventId: string;
  eventName: string;
  participantName: string;
  analyticsId: string;       // link to AnalyticsRecord
  // Individual factor scores (0–100 each)
  pvScore: number;           // page view count
  dwellScore: number;        // total dwell time on pages
  cmCompletionScore: number; // CM video watched to completion
  photoDlScore: number;      // photos downloaded
  npsScore: number;          // NPS survey responded
  couponScore: number;       // coupon interactions (copy/redeem)
  // Weighted total (0–100)
  totalScore: number;
  calculatedAt: number;
}

export interface AdminUser {
  id: string;
  name: string;
  email?: string;
  password: string;
  role: AdminRole;
  tenantId?: string;
  permissions: Permission[];
  isActive: boolean;
  createdAt: number;
  lastLoginAt?: number;
}
