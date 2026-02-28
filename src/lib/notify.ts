import { getStoredEvents, getStoredTenants, addNotificationLog, updateNotificationLog } from "./store";
import { csrfHeaders } from "./csrf";
import { Tenant } from "./types";

/**
 * Send a notification email to the event admin (if notifyEmail is set).
 * Logs optimistically, then updates status based on API response.
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

    const logId = `nl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    addNotificationLog({
      id: logId,
      eventId,
      type,
      to: event.notifyEmail,
      subject,
      status: "logged",
      method: "pending",
      timestamp: Date.now(),
    });

    fetch("/api/notify", {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        to: event.notifyEmail,
        eventName: event.name,
        type,
        participantName: extra?.participantName,
        companyName: extra?.companyName,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        updateNotificationLog(logId, {
          status: data.status === "sent" ? "sent" : data.status === "failed" ? "failed" : "logged",
          method: data.method || "unknown",
        });
      })
      .catch(() => {
        updateNotificationLog(logId, { status: "failed", method: "error" });
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

        if (t.contactEmail) {
          const logId = `nl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

          addNotificationLog({
            id: logId,
            eventId: t.id,
            type: "license_expiry",
            to: t.contactEmail,
            subject: `ライセンス期限通知: ${t.name} (残り${daysLeft}日)`,
            status: "logged",
            method: "pending",
            timestamp: Date.now(),
          });

          fetch("/api/notify", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              to: t.contactEmail,
              eventName: t.name,
              type: "license_expiry",
              daysLeft,
              tenantName: t.name,
              licenseEnd: t.licenseEnd,
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              updateNotificationLog(logId, {
                status: data.status === "sent" ? "sent" : data.status === "failed" ? "failed" : "logged",
                method: data.method || "unknown",
              });
            })
            .catch(() => {
              updateNotificationLog(logId, { status: "failed", method: "error" });
            });
        }
      }
    }

    return expiring;
  } catch {
    return [];
  }
}
