#!/usr/bin/env node
/**
 * Generate sample company data for VLS Admin testing.
 * Creates placeholder companies with ui-avatars.com logos.
 * 
 * Usage: node scripts/generate-sample-companies.js
 * 
 * Output: Prints JSON array ready to paste into browser console:
 *   setStoredCompanies([...sampleData])
 */

const companies = [
  {
    id: "co-kids-learning",
    name: "キッズラーニング株式会社",
    logoUrl: "https://ui-avatars.com/api/?name=KL&background=6EC6FF&color=fff&size=80&rounded=true",
    tier: "platinum",
    tags: ["education", "kids"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "無料体験レッスン受付中！",
    offerUrl: "https://example.com/kids",
    couponCode: "KIDS2026",
    portalPassword: "KIDS_PASS",
  },
  {
    id: "co-sports-club",
    name: "フィットネススポーツクラブ",
    logoUrl: "https://ui-avatars.com/api/?name=FS&background=FF6B6B&color=fff&size=80&rounded=true",
    tier: "platinum",
    tags: ["sports", "health"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "初月無料キャンペーン",
    offerUrl: "https://example.com/sports",
    couponCode: "SPORTS2026",
    portalPassword: "SPORTS_PASS",
  },
  {
    id: "co-music-academy",
    name: "音楽アカデミー",
    logoUrl: "https://ui-avatars.com/api/?name=MA&background=9B59B6&color=fff&size=80&rounded=true",
    tier: "gold",
    tags: ["music", "education"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "入会金半額！",
    offerUrl: "https://example.com/music",
    couponCode: "MUSIC2026",
    portalPassword: "MUSIC_PASS",
  },
  {
    id: "co-art-studio",
    name: "アートスタジオ彩",
    logoUrl: "https://ui-avatars.com/api/?name=AS&background=F39C12&color=fff&size=80&rounded=true",
    tier: "gold",
    tags: ["art", "kids"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "体験教室開催中",
    offerUrl: "https://example.com/art",
    couponCode: "ART2026",
    portalPassword: "ART_PASS",
  },
  {
    id: "co-coding-school",
    name: "プログラミングスクール TechKids",
    logoUrl: "https://ui-avatars.com/api/?name=TC&background=27AE60&color=fff&size=80&rounded=true",
    tier: "gold",
    tags: ["education", "tech"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "夏期講習受付開始",
    offerUrl: "https://example.com/coding",
    couponCode: "TECH2026",
    portalPassword: "TECH_PASS",
  },
  {
    id: "co-dance-studio",
    name: "ダンススタジオリズム",
    logoUrl: "https://ui-avatars.com/api/?name=DR&background=E74C3C&color=fff&size=80&rounded=true",
    tier: "silver",
    tags: ["sports", "art"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "無料体験レッスン",
    offerUrl: "https://example.com/dance",
    couponCode: "DANCE2026",
    portalPassword: "DANCE_PASS",
  },
  {
    id: "co-english-school",
    name: "イングリッシュスクール Global",
    logoUrl: "https://ui-avatars.com/api/?name=EG&background=3498DB&color=fff&size=80&rounded=true",
    tier: "silver",
    tags: ["education", "language"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "入会特典あり",
    offerUrl: "https://example.com/english",
    couponCode: "GLOBAL2026",
    portalPassword: "GLOBAL_PASS",
  },
  {
    id: "co-swimming",
    name: "スイミングスクール Aqua",
    logoUrl: "https://ui-avatars.com/api/?name=SA&background=1ABC9C&color=fff&size=80&rounded=true",
    tier: "silver",
    tags: ["sports", "kids"],
    videos: { cm15: "", cm30: "", cm60: "" },
    offerText: "夏季プール開校",
    offerUrl: "https://example.com/swimming",
    couponCode: "AQUA2026",
    portalPassword: "AQUA_PASS",
  },
];

console.log("// VLS Admin 企業管理タブのブラウザコンソールで実行:");
console.log("setStoredCompanies(" + JSON.stringify(companies, null, 2) + ")");
console.log("");
console.log("// またはこのコマンドでファイル出力:");
console.log("// node scripts/generate-sample-companies.js > sample-companies.json");
