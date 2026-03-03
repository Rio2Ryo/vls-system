import { OfferInteraction, OfferActionType } from "./types";
import { addOfferInteraction } from "./store";

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

function createInteraction(
  action: OfferActionType,
  companyId: string,
  companyName: string,
  extra?: Partial<OfferInteraction>,
): OfferInteraction {
  return {
    id: `oi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    eventId: getEventId(),
    sessionId: getSessionId(),
    companyId,
    companyName,
    action,
    timestamp: Date.now(),
    ...extra,
  };
}

/** Track when an offer card becomes visible to the user */
export function trackOfferView(companyId: string, companyName: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addOfferInteraction(createInteraction("offer_view", companyId, companyName));
}

/** Track when user clicks on the offer link */
export function trackOfferClick(companyId: string, companyName: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addOfferInteraction(createInteraction("offer_click", companyId, companyName));
}

/** Track when a coupon code is displayed to the user */
export function trackCouponView(companyId: string, companyName: string, couponCode: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addOfferInteraction(createInteraction("coupon_view", companyId, companyName, { couponCode }));
}

/** Track when user copies a coupon code */
export function trackCouponCopy(companyId: string, companyName: string, couponCode: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addOfferInteraction(createInteraction("coupon_copy", companyId, companyName, { couponCode }));
}

/** Track an external coupon redemption (admin manual or API callback) */
export function trackCouponRedeem(companyId: string, companyName: string, couponCode: string): void {
  const eventId = getEventId();
  if (!eventId) return;
  addOfferInteraction(createInteraction("coupon_redeem", companyId, companyName, { couponCode }));
}
