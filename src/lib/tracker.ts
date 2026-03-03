import { BehaviorEvent, BehaviorEventType } from "./types";
import { addBehaviorEvent } from "./store";

/** Generate or retrieve a session-scoped ID */
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("vls_session_id");
  if (!sid) {
    sid = `s_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("vls_session_id", sid);
  }
  return sid;
}

function getEventId(): string {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("eventId") || "";
}

function createEvent(type: BehaviorEventType, page: string, extra?: Partial<BehaviorEvent>): BehaviorEvent {
  return {
    id: `be_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventId: getEventId(),
    sessionId: getSessionId(),
    type,
    page,
    timestamp: Date.now(),
    ...extra,
  };
}

/** Track a page view */
export function trackPageView(page: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addBehaviorEvent(createEvent("page_view", page));
}

/** Track page leave with dwell time. Call on unmount or beforeunload. */
export function trackPageLeave(page: string, enterTime: number): void {
  const eventId = getEventId();
  if (!eventId) return;
  const dwellMs = Date.now() - enterTime;
  if (dwellMs < 500) return; // ignore very short visits (likely redirects)
  addBehaviorEvent(createEvent("page_leave", page, { dwellMs }));
}

/** Track scroll depth (0-100) */
export function trackScroll(page: string, depth: number): void {
  const eventId = getEventId();
  if (!eventId) return;
  addBehaviorEvent(createEvent("scroll", page, { scrollDepth: Math.round(depth) }));
}

/** Track a tap/click on an element */
export function trackTap(page: string, targetElement: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addBehaviorEvent(createEvent("tap", page, { targetElement }));
}

/** Track form submission */
export function trackFormSubmit(page: string, metadata?: Record<string, string>): void {
  const eventId = getEventId();
  if (!eventId) return;
  addBehaviorEvent(createEvent("form_submit", page, { metadata }));
}

/**
 * usePageTracker hook helper — returns { enterTime } for use with cleanup.
 * Usage in component:
 *   useEffect(() => {
 *     trackPageView("/survey");
 *     const enterTime = Date.now();
 *     return () => trackPageLeave("/survey", enterTime);
 *   }, []);
 */
