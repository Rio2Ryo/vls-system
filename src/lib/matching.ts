import { Company, CMMatch, InterestTag } from "./types";
import { COMPANIES } from "./data";

/**
 * Select platinum company for 15s fixed CM
 * Random from platinum-tier companies
 */
function selectPlatinumCM(): Company | null {
  const platinums = COMPANIES.filter((c) => c.tier === "platinum");
  if (platinums.length === 0) return null;
  return platinums[Math.floor(Math.random() * platinums.length)];
}

/**
 * Match a company for 30s+60s CM based on user tags
 *
 * Algorithm per spec:
 * Case A (Pt + Gold + General overlap): Pt=40%, Gd=40%, OP=20%
 * Case B (Pt + Gold only): Pt=50%, Gd=50%
 * Case C (Gold + General only): Gd=80%, OP=20%
 * Case D (Pt + General only): Pt=80%, OP=20%
 * Single match: 100%
 */
function selectMatchedCM(userTags: InterestTag[]): Company | null {
  if (userTags.length === 0) {
    // No tags - random from all
    return COMPANIES[Math.floor(Math.random() * COMPANIES.length)] || null;
  }

  const hasOverlap = (company: Company) =>
    company.tags.some((t) => userTags.includes(t));

  const matched = {
    platinum: COMPANIES.filter((c) => c.tier === "platinum" && hasOverlap(c)),
    gold: COMPANIES.filter((c) => c.tier === "gold" && hasOverlap(c)),
    general: COMPANIES.filter(
      (c) => (c.tier === "silver" || c.tier === "bronze") && hasOverlap(c)
    ),
  };

  const hasPt = matched.platinum.length > 0;
  const hasGd = matched.gold.length > 0;
  const hasOp = matched.general.length > 0;

  const rand = Math.random();

  // Case A: all three
  if (hasPt && hasGd && hasOp) {
    if (rand < 0.4) return pick(matched.platinum);
    if (rand < 0.8) return pick(matched.gold);
    return pick(matched.general);
  }
  // Case B: Pt + Gold
  if (hasPt && hasGd) {
    return rand < 0.5 ? pick(matched.platinum) : pick(matched.gold);
  }
  // Case C: Gold + General
  if (hasGd && hasOp) {
    return rand < 0.8 ? pick(matched.gold) : pick(matched.general);
  }
  // Case D: Pt + General
  if (hasPt && hasOp) {
    return rand < 0.8 ? pick(matched.platinum) : pick(matched.general);
  }
  // Single matches
  if (hasPt) return pick(matched.platinum);
  if (hasGd) return pick(matched.gold);
  if (hasOp) return pick(matched.general);

  // No match at all - fallback to random
  return COMPANIES[Math.floor(Math.random() * COMPANIES.length)] || null;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getCMMatch(userTags: InterestTag[]): CMMatch {
  return {
    platinumCM: selectPlatinumCM(),
    matchedCM: selectMatchedCM(userTags),
  };
}
