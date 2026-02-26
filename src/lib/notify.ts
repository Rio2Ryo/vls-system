import { getStoredEvents } from "./store";

/**
 * Send a notification email to the event admin (if notifyEmail is set).
 * Fire-and-forget — never throws.
 */
export function sendNotification(
  eventId: string,
  type: "registration" | "cm_complete",
  extra?: { participantName?: string; companyName?: string }
): void {
  try {
    const events = getStoredEvents();
    const event = events.find((e) => e.id === eventId);
    if (!event?.notifyEmail) return;

    fetch("/api/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: event.notifyEmail,
        eventName: event.name,
        type,
        participantName: extra?.participantName,
        companyName: extra?.companyName,
      }),
    }).catch(() => {
      // fire and forget
    });
  } catch {
    // never throw from notification code
  }
}
