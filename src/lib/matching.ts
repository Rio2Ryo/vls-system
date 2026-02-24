import { Company, CMMatch, InterestTag } from "./types";
import { getStoredCompanies } from "./store";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function getCMMatch(userTags: InterestTag[], eventCompanyIds?: string[]): CMMatch {
  const allCompanies = getStoredCompanies();
  // Filter by event-associated companies if specified; otherwise use all
  const companies = eventCompanyIds && eventCompanyIds.length > 0
    ? allCompanies.filter((c) => eventCompanyIds.includes(c.id))
    : allCompanies;

  // Platinum CM: random from platinum tier
  const platinums = companies.filter((c) => c.tier === "platinum");
  const platinumCM = platinums.length > 0 ? pick(platinums) : null;

  // Matched CM based on user tags
  let matchedCM: Company | null = null;

  if (userTags.length === 0) {
    matchedCM = companies.length > 0 ? pick(companies) : null;
  } else {
    const hasOverlap = (company: Company) =>
      company.tags.some((t) => userTags.includes(t));

    const matched = {
      platinum: companies.filter((c) => c.tier === "platinum" && hasOverlap(c)),
      gold: companies.filter((c) => c.tier === "gold" && hasOverlap(c)),
      general: companies.filter(
        (c) => (c.tier === "silver" || c.tier === "bronze") && hasOverlap(c)
      ),
    };

    const hasPt = matched.platinum.length > 0;
    const hasGd = matched.gold.length > 0;
    const hasOp = matched.general.length > 0;
    const rand = Math.random();

    if (hasPt && hasGd && hasOp) {
      matchedCM = rand < 0.4 ? pick(matched.platinum) : rand < 0.8 ? pick(matched.gold) : pick(matched.general);
    } else if (hasPt && hasGd) {
      matchedCM = rand < 0.5 ? pick(matched.platinum) : pick(matched.gold);
    } else if (hasGd && hasOp) {
      matchedCM = rand < 0.8 ? pick(matched.gold) : pick(matched.general);
    } else if (hasPt && hasOp) {
      matchedCM = rand < 0.8 ? pick(matched.platinum) : pick(matched.general);
    } else if (hasPt) {
      matchedCM = pick(matched.platinum);
    } else if (hasGd) {
      matchedCM = pick(matched.gold);
    } else if (hasOp) {
      matchedCM = pick(matched.general);
    } else {
      matchedCM = companies.length > 0 ? pick(companies) : null;
    }
  }

  return { platinumCM, matchedCM };
}
