/**
 * Participant Engagement Score Calculator
 *
 * Weights:
 *   PV count       10%
 *   Dwell time     15%
 *   CM completion  25%
 *   Photo DL       25%
 *   NPS response   15%
 *   Coupon usage   10%
 */

import {
  AnalyticsRecord,
  BehaviorEvent,
  EngagementScore,
  EventData,
  NpsResponse,
  OfferInteraction,
  VideoPlayRecord,
} from "./types";

/* ─── weight constants ─── */
const W_PV = 0.10;
const W_DWELL = 0.15;
const W_CM = 0.25;
const W_PHOTO = 0.25;
const W_NPS = 0.15;
const W_COUPON = 0.10;

/* ─── scoring thresholds ─── */
// PV: 5 page views → full score (100)
const PV_MAX = 5;
// Dwell: 180 seconds total → full score
const DWELL_MAX_MS = 180_000;

/* ─── helpers ─── */

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function normalize(value: number, max: number): number {
  return clamp((value / max) * 100, 0, 100);
}

/* ─── main calculator ─── */

export interface EngagementInput {
  analytics: AnalyticsRecord[];
  videoPlays: VideoPlayRecord[];
  behaviorEvents: BehaviorEvent[];
  npsResponses: NpsResponse[];
  offerInteractions: OfferInteraction[];
  events: EventData[];
}

/**
 * Calculate engagement scores for all participants across given data.
 * One score per AnalyticsRecord (= one user session).
 */
export function calculateEngagementScores(input: EngagementInput): EngagementScore[] {
  const {
    analytics,
    videoPlays,
    behaviorEvents,
    npsResponses,
    offerInteractions,
    events,
  } = input;

  // Build event name lookup
  const eventNameMap = new Map(events.map((e) => [e.id, e.name]));

  // Index video plays by eventId
  const videoByEvent = groupBy(videoPlays, (v) => v.eventId);

  // Index behavior events by eventId+sessionId
  const behaviorByEvent = groupBy(behaviorEvents, (b) => b.eventId);

  // Index NPS by eventId+name
  const npsByEvent = groupBy(npsResponses, (n) => n.eventId);

  // Index offer interactions by eventId
  const offerByEvent = groupBy(offerInteractions, (o) => o.eventId);

  const scores: EngagementScore[] = [];

  for (const rec of analytics) {
    const name = rec.respondentName || "匿名";
    const eventId = rec.eventId;

    // --- PV score ---
    const sessionBehaviors = (behaviorByEvent.get(eventId) || []);
    // Try to match by session: use analytics record timestamp as approximate session indicator
    // Since we can't perfectly link session IDs, we approximate by matching the time window
    const pvCount = sessionBehaviors.filter((b) => b.type === "page_view").length;
    const pvPerSession = analytics.filter((a) => a.eventId === eventId).length;
    const avgPv = pvPerSession > 0 ? pvCount / pvPerSession : 0;
    const pvScore = normalize(Math.min(avgPv, PV_MAX), PV_MAX);

    // --- Dwell score ---
    const totalDwell = sessionBehaviors
      .filter((b) => b.type === "page_leave" && b.dwellMs)
      .reduce((sum, b) => sum + (b.dwellMs || 0), 0);
    const avgDwell = pvPerSession > 0 ? totalDwell / pvPerSession : 0;
    const dwellScore = normalize(Math.min(avgDwell, DWELL_MAX_MS), DWELL_MAX_MS);

    // --- CM completion score ---
    const eventVideos = videoByEvent.get(eventId) || [];
    const cmCompleted = eventVideos.some((v) => v.completed);
    const stepCm = rec.stepsCompleted.cmViewed;
    const cmCompletionScore = stepCm ? (cmCompleted ? 100 : 60) : 0;

    // --- Photo DL score ---
    const stepDl = rec.stepsCompleted.downloaded;
    const stepPhotos = rec.stepsCompleted.photosViewed;
    const photoDlScore = stepDl ? 100 : stepPhotos ? 40 : 0;

    // --- NPS score ---
    const eventNps = npsByEvent.get(eventId) || [];
    const hasNps = eventNps.some(
      (n) => n.participantName === name && n.score !== undefined
    );
    const npsScore = hasNps ? 100 : 0;

    // --- Coupon score ---
    const eventOffers = offerByEvent.get(eventId) || [];
    const hasCouponAction = eventOffers.some(
      (o) => o.action === "coupon_copy" || o.action === "coupon_redeem"
    );
    const hasOfferClick = eventOffers.some((o) => o.action === "offer_click");
    const couponScore = hasCouponAction ? 100 : hasOfferClick ? 50 : 0;

    // --- Weighted total ---
    const totalScore = Math.round(
      pvScore * W_PV +
      dwellScore * W_DWELL +
      cmCompletionScore * W_CM +
      photoDlScore * W_PHOTO +
      npsScore * W_NPS +
      couponScore * W_COUPON
    );

    scores.push({
      id: rec.id,
      eventId,
      eventName: eventNameMap.get(eventId) || eventId,
      participantName: name,
      analyticsId: rec.id,
      pvScore: Math.round(pvScore),
      dwellScore: Math.round(dwellScore),
      cmCompletionScore: Math.round(cmCompletionScore),
      photoDlScore: Math.round(photoDlScore),
      npsScore: Math.round(npsScore),
      couponScore: Math.round(couponScore),
      totalScore: clamp(totalScore, 0, 100),
      calculatedAt: Date.now(),
    });
  }

  return scores;
}

/**
 * Classify score into engagement tier.
 */
export function getEngagementTier(score: number): "高" | "中" | "低" {
  if (score >= 70) return "高";
  if (score >= 40) return "中";
  return "低";
}

/**
 * Build histogram buckets (0-9, 10-19, ..., 90-100).
 */
export function buildHistogram(scores: EngagementScore[]): { range: string; count: number }[] {
  const buckets = Array.from({ length: 10 }, (_, i) => ({
    range: `${i * 10}-${i * 10 + 9}`,
    count: 0,
  }));
  // Fix last bucket label
  buckets[9].range = "90-100";

  for (const s of scores) {
    const idx = Math.min(Math.floor(s.totalScore / 10), 9);
    buckets[idx].count++;
  }
  return buckets;
}

/**
 * Aggregate scores by event for comparison.
 */
export function aggregateByEvent(
  scores: EngagementScore[]
): { eventId: string; eventName: string; avgScore: number; count: number; highPct: number }[] {
  const map = new Map<string, { eventName: string; total: number; count: number; high: number }>();

  for (const s of scores) {
    const entry = map.get(s.eventId) || { eventName: s.eventName, total: 0, count: 0, high: 0 };
    entry.total += s.totalScore;
    entry.count++;
    if (s.totalScore >= 70) entry.high++;
    map.set(s.eventId, entry);
  }

  return Array.from(map.entries()).map(([eventId, v]) => ({
    eventId,
    eventName: v.eventName,
    avgScore: Math.round(v.total / v.count),
    count: v.count,
    highPct: Math.round((v.high / v.count) * 100),
  }));
}

/* ─── utility ─── */

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}
