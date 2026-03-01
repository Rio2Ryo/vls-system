import { Company, CMMatchResult, CompanyTier, InterestTag, MatchScoreBreakdown } from "./types";
import { getStoredCompanies } from "./store";

// --- Tag classification ---
const THEME_TAGS = new Set<InterestTag>(["education", "sports", "food", "travel", "technology", "art", "nature", "other"]);
const SERVICE_TAGS = new Set<InterestTag>(["cram_school", "lessons", "food_product", "travel_service", "smartphone", "camera", "insurance"]);
const AGE_TAGS = new Set<InterestTag>(["age_0_3", "age_4_6", "age_7_9", "age_10_12", "age_13_plus"]);

// --- Score weights ---
const THEME_TAG_POINTS = 15;
const SERVICE_TAG_POINTS = 20;
const TIER_BONUS: Record<CompanyTier, number> = { platinum: 30, gold: 20, silver: 10, bronze: 0 };
const AGE_MATCH_BONUS = 25;
const CATEGORY_BREADTH_BONUS = 15;

function scoreCompany(company: Company, userTags: InterestTag[]): MatchScoreBreakdown {
  let tagMatchScore = 0;
  let tagMatchCount = 0;
  const tagMatchDetails: string[] = [];
  let ageMatchBonus = 0;
  let hasThemeMatch = false;
  let hasServiceMatch = false;

  const userTagSet = new Set(userTags);
  const userAgeTags = userTags.filter((t) => AGE_TAGS.has(t));

  for (const tag of company.tags) {
    if (!userTagSet.has(tag)) continue;

    if (THEME_TAGS.has(tag)) {
      tagMatchScore += THEME_TAG_POINTS;
      tagMatchCount++;
      tagMatchDetails.push(tag);
      hasThemeMatch = true;
    } else if (SERVICE_TAGS.has(tag)) {
      tagMatchScore += SERVICE_TAG_POINTS;
      tagMatchCount++;
      tagMatchDetails.push(tag);
      hasServiceMatch = true;
    } else if (AGE_TAGS.has(tag)) {
      // Age match scored separately
      if (userAgeTags.includes(tag)) {
        ageMatchBonus = AGE_MATCH_BONUS;
        tagMatchDetails.push(tag);
      }
    }
  }

  const categoryBreadth = hasThemeMatch && hasServiceMatch ? CATEGORY_BREADTH_BONUS : 0;
  const tierBonus = TIER_BONUS[company.tier];
  const totalScore = tagMatchScore + tierBonus + ageMatchBonus + categoryBreadth;

  return {
    companyId: company.id,
    companyName: company.name,
    tier: company.tier,
    totalScore,
    breakdown: {
      tagMatchScore,
      tagMatchCount,
      tagMatchDetails,
      tierBonus,
      ageMatchBonus,
      categoryBreadth,
    },
  };
}

// Tier rank for tiebreaking (lower = higher priority)
const TIER_RANK: Record<CompanyTier, number> = { platinum: 0, gold: 1, silver: 2, bronze: 3 };

function sortScores(scores: MatchScoreBreakdown[]): MatchScoreBreakdown[] {
  return [...scores].sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (TIER_RANK[a.tier] !== TIER_RANK[b.tier]) return TIER_RANK[a.tier] - TIER_RANK[b.tier];
    return a.companyId.localeCompare(b.companyId);
  });
}

export function getCMMatch(
  userTags: InterestTag[],
  eventCompanyIds?: string[],
  options?: { includeDebug?: boolean }
): CMMatchResult {
  const allCompanies = getStoredCompanies();

  // Filter by event-associated companies if specified
  const companies = eventCompanyIds && eventCompanyIds.length > 0
    ? allCompanies.filter((c) => eventCompanyIds.includes(c.id))
    : allCompanies;

  if (companies.length === 0) {
    return {
      platinumCM: null,
      matchedCM: null,
      platinumCMs: [],
      ...(options?.includeDebug ? {
        debug: { allScores: [], platinumScores: [], userTags, selectedCompanyIds: eventCompanyIds, reason: "No companies available" },
      } : {}),
    };
  }

  // Score all companies
  const allScores = sortScores(companies.map((c) => scoreCompany(c, userTags)));
  const companyMap = new Map(companies.map((c) => [c.id, c]));

  // Select platinum CM: random pick from all platinum companies
  const platinumScores = sortScores(allScores.filter((s) => s.tier === "platinum"));
  const platinumIdx = platinumScores.length > 0 ? Math.floor(Math.random() * platinumScores.length) : -1;
  const platinumCM = platinumIdx >= 0 ? companyMap.get(platinumScores[platinumIdx].companyId) ?? null : null;

  // Select matched CM: highest-scoring company (excluding platinum CM)
  const matchedScores = allScores.filter((s) => s.companyId !== platinumCM?.id);
  const matchedCM = matchedScores.length > 0 ? companyMap.get(matchedScores[0].companyId) ?? null : null;

  // Build reason string
  let reason = "";
  if (platinumCM && platinumIdx >= 0) {
    const ps = platinumScores[platinumIdx];
    reason += `Platinum: ${ps.companyName} (score: ${ps.totalScore})`;
    if (ps.breakdown.tagMatchDetails.length > 0) {
      reason += ` [tags: ${ps.breakdown.tagMatchDetails.join(", ")}]`;
    }
  }
  if (matchedCM && matchedScores[0]) {
    const ms = matchedScores[0];
    if (reason) reason += " | ";
    reason += `Matched: ${ms.companyName} (score: ${ms.totalScore})`;
    if (ms.breakdown.tagMatchDetails.length > 0) {
      reason += ` [tags: ${ms.breakdown.tagMatchDetails.join(", ")}]`;
    }
  }
  if (!reason) reason = "No companies matched";

  // Collect all platinum companies for banner display (max 3)
  const platinumCMs = platinumScores
    .slice(0, 3)
    .map((s) => companyMap.get(s.companyId))
    .filter((c): c is Company => c !== undefined);

  const result: CMMatchResult = { platinumCM, matchedCM, platinumCMs };

  if (options?.includeDebug) {
    result.debug = {
      allScores,
      platinumScores,
      userTags,
      selectedCompanyIds: eventCompanyIds,
      reason,
    };
  }

  return result;
}
