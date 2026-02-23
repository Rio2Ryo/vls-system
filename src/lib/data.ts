import { Company, EventData, SurveyQuestion } from "./types";

// --- Demo Companies ---
export const COMPANIES: Company[] = [
  {
    id: "co-platinum-1",
    name: "キッズラーニング株式会社",
    logoUrl: "https://ui-avatars.com/api/?name=KL&background=6EC6FF&color=fff&size=80&rounded=true",
    tier: "platinum",
    tags: ["education", "cram_school", "technology"],
    videos: {
      cm15: "dQw4w9WgXcQ",
      cm30: "dQw4w9WgXcQ",
      cm60: "dQw4w9WgXcQ",
    },
    offerText: "無料体験レッスン1ヶ月分プレゼント！",
    offerUrl: "https://example.com/kids-learning",
    couponCode: "VLSKIDS2026",
  },
  {
    id: "co-gold-1",
    name: "ファミリートラベル",
    logoUrl: "https://ui-avatars.com/api/?name=FT&background=FFB6C1&color=fff&size=80&rounded=true",
    tier: "gold",
    tags: ["travel", "travel_service", "nature", "food"],
    videos: {
      cm15: "dQw4w9WgXcQ",
      cm30: "dQw4w9WgXcQ",
      cm60: "dQw4w9WgXcQ",
    },
    offerText: "家族旅行10%OFFクーポン",
    offerUrl: "https://example.com/family-travel",
    couponCode: "VLSTRIP2026",
  },
  {
    id: "co-silver-1",
    name: "スポーツキッズアカデミー",
    logoUrl: "https://ui-avatars.com/api/?name=SK&background=98E4C1&color=fff&size=80&rounded=true",
    tier: "silver",
    tags: ["sports", "lessons", "education"],
    videos: {
      cm15: "dQw4w9WgXcQ",
      cm30: "dQw4w9WgXcQ",
      cm60: "dQw4w9WgXcQ",
    },
    offerText: "入会金無料キャンペーン中！",
    offerUrl: "https://example.com/sports-kids",
  },
  {
    id: "co-bronze-1",
    name: "おいしいキッチン",
    logoUrl: "https://ui-avatars.com/api/?name=OK&background=FFE4A0&color=fff&size=80&rounded=true",
    tier: "bronze",
    tags: ["food", "food_product"],
    videos: {
      cm15: "dQw4w9WgXcQ",
      cm30: "dQw4w9WgXcQ",
      cm60: "dQw4w9WgXcQ",
    },
    offerText: "お試しセット500円OFF",
    offerUrl: "https://example.com/oishii-kitchen",
  },
];

// --- Demo Events ---
export const EVENTS: EventData[] = [
  {
    id: "evt-summer",
    name: "夏祭り 2026",
    date: "2026-08-15",
    description: "楽しい夏祭りイベント",
    password: "SUMMER2026",
    photos: generateDemoPhotos("summer", 12),
  },
  {
    id: "evt-sports",
    name: "運動会 2026",
    date: "2026-10-10",
    description: "秋の大運動会",
    password: "SPORTS2026",
    photos: generateDemoPhotos("sports", 9),
  },
  {
    id: "evt-graduation",
    name: "卒業式 2026",
    date: "2026-03-20",
    description: "感動の卒業式",
    password: "GRADUATION2026",
    photos: generateDemoPhotos("graduation", 15),
  },
];

function generateDemoPhotos(seed: string, count: number): EventData["photos"] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${seed}-photo-${i + 1}`,
    originalUrl: `https://picsum.photos/seed/${seed}${i + 1}/1200/800`,
    thumbnailUrl: `https://picsum.photos/seed/${seed}${i + 1}/400/300`,
    watermarked: true,
  }));
}

// --- Password → Event Mapping ---
export function getEventByPassword(password: string): EventData | null {
  return EVENTS.find((e) => e.password === password.toUpperCase()) || null;
}

// --- Default Survey ---
export const DEFAULT_SURVEY: SurveyQuestion[] = [
  {
    id: "q1",
    question: "親子で興味があるテーマは？",
    maxSelections: 3,
    options: [
      { label: "教育", tag: "education" },
      { label: "スポーツ", tag: "sports" },
      { label: "食", tag: "food" },
      { label: "旅行", tag: "travel" },
      { label: "テクノロジー", tag: "technology" },
      { label: "アート", tag: "art" },
      { label: "自然", tag: "nature" },
      { label: "その他", tag: "other" },
    ],
  },
  {
    id: "q2",
    question: "気になるサービスは？",
    maxSelections: 3,
    options: [
      { label: "学習塾", tag: "cram_school" },
      { label: "習い事", tag: "lessons" },
      { label: "食品", tag: "food_product" },
      { label: "旅行", tag: "travel_service" },
      { label: "スマホ", tag: "smartphone" },
      { label: "カメラ", tag: "camera" },
      { label: "保険", tag: "insurance" },
      { label: "その他", tag: "other" },
    ],
  },
  {
    id: "q3",
    question: "お子様の年齢は？",
    maxSelections: 1,
    options: [
      { label: "0〜3歳", tag: "age_0_3" },
      { label: "4〜6歳", tag: "age_4_6" },
      { label: "7〜9歳", tag: "age_7_9" },
      { label: "10〜12歳", tag: "age_10_12" },
      { label: "13歳以上", tag: "age_13_plus" },
    ],
  },
];

export const ADMIN_PASSWORD = "ADMIN_VLS_2026";
