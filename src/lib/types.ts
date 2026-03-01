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
}

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
