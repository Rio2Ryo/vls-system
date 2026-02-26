import { getStoredEvents, getStoredTenants, addNotificationLog } from "./store";
import { Tenant } from "./types";

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

    const subject = type === "registration"
      ? `新規参加者: ${extra?.participantName || "匿名"} — ${event.name}`
      : `CM視聴完了: ${extra?.participantName || "匿名"} (${extra?.companyName || "—"}) — ${event.name}`;

    addNotificationLog({
      id: `nl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      type,
      to: event.notifyEmail,
      subject,
      status: "logged",
      method: "api",
      timestamp: Date.now(),
    });

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

/**
 * Check all tenants for license expiry within the given threshold (days).
 * Returns tenants that are expiring soon. Sends notification for each.
 */
export function checkLicenseExpiry(thresholdDays = 30): Tenant[] {
  try {
    const tenants = getStoredTenants();
    const now = new Date();
    const expiring: Tenant[] = [];

    for (const t of tenants) {
      if (!t.licenseEnd || t.isActive === false) continue;
      const endDate = new Date(t.licenseEnd + "T23:59:59");
      const daysLeft = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysLeft > 0 && daysLeft <= thresholdDays) {
        expiring.push(t);
        // Send notification
        if (t.contactEmail) {
          fetch("/api/notify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              to: t.contactEmail,
              eventName: t.name,
              type: "license_expiry",
              daysLeft,
              tenantName: t.name,
              licenseEnd: t.licenseEnd,
            }),
          }).catch(() => {});

          // Log the notification
          addNotificationLog({
            id: `nl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            eventId: t.id, // re-use eventId field for tenantId
            type: "license_expiry",
            to: t.contactEmail,
            subject: `ライセンス期限通知: ${t.name} (残り${daysLeft}日)`,
            status: "logged",
            method: "api",
            timestamp: Date.now(),
          });
        }
      }
    }

    return expiring;
  } catch {
    return [];
  }
}
