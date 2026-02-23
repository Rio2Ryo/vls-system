import { MatchResult, MatchLevel, PhotoTag } from "./types";

function getMatchLevel(score: number): MatchLevel {
  if (score >= 90) return "certain";
  if (score >= 70) return "high";
  if (score >= 50) return "review";
  return "none";
}

// Dummy photo URLs for demo
const DUMMY_PHOTOS = [
  "https://picsum.photos/seed/vls1/400/300",
  "https://picsum.photos/seed/vls2/400/300",
  "https://picsum.photos/seed/vls3/400/300",
  "https://picsum.photos/seed/vls4/400/300",
  "https://picsum.photos/seed/vls5/400/300",
  "https://picsum.photos/seed/vls6/400/300",
  "https://picsum.photos/seed/vls7/400/300",
  "https://picsum.photos/seed/vls8/400/300",
];

const DUMMY_TAGS: PhotoTag[][] = [
  ["face_detected", "individual", "outdoor"],
  ["face_detected", "group", "outdoor"],
  ["face_detected", "individual", "indoor"],
  ["face_detected", "group", "indoor"],
  ["face_detected", "group", "outdoor"],
  ["no_face", "group", "outdoor"],
  ["no_face", "individual", "indoor"],
  ["no_face", "group", "indoor"],
];

export function generateDummyResults(): MatchResult[] {
  const results: MatchResult[] = [];
  const scores = [95, 92, 88, 85, 75, 62, 55, 40];

  for (let i = 0; i < scores.length; i++) {
    const score = scores[i];
    const level = getMatchLevel(score);
    if (level === "none") continue;

    results.push({
      id: `match-${i + 1}`,
      thumbnailUrl: DUMMY_PHOTOS[i],
      score,
      level,
      eventName: "サマーフェスティバル 2026",
      date: "2026-02-23",
      tags: DUMMY_TAGS[i],
    });
  }

  return results;
}

export function getResultsByLevel(results: MatchResult[]): Record<MatchLevel, MatchResult[]> {
  return {
    certain: results.filter((r) => r.level === "certain"),
    high: results.filter((r) => r.level === "high"),
    review: results.filter((r) => r.level === "review"),
    none: results.filter((r) => r.level === "none"),
  };
}
