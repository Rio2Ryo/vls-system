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
  description: string;
  password: string;
  photos: PhotoData[];
  companyIds?: string[];  // associated company IDs; undefined = all companies
}

export interface PhotoData {
  id: string;
  originalUrl: string;    // high quality
  thumbnailUrl: string;   // low quality for grid
  watermarked: boolean;
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
