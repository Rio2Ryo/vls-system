import { WebhookEventType } from "./types";
import { getStoredWebhooks, addWebhookLog } from "./store";

const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  checkin: "チェックイン",
  download_complete: "ダウンロード完了",
  cm_viewed: "CM視聴完了",
  survey_complete: "アンケート回答",
};

/**
 * Fire webhooks for a given event type.
 * Finds all enabled webhooks matching the event type + optional tenant,
 * sends POST to each URL with retry (3 attempts), and logs results.
 * Fire-and-forget — never throws.
 */
export function fireWebhook(
  eventType: WebhookEventType,
  payload: Record<string, unknown>,
  tenantId?: string | null,
): void {
  try {
    const webhooks = getStoredWebhooks().filter(
      (w) =>
        w.enabled &&
        w.events.includes(eventType) &&
        (!w.tenantId || !tenantId || w.tenantId === tenantId),
    );

    if (webhooks.length === 0) return;

    const body = JSON.stringify({
      event: eventType,
      label: WEBHOOK_EVENT_LABELS[eventType],
      timestamp: new Date().toISOString(),
      ...payload,
    });

    for (const wh of webhooks) {
      sendWithRetry(wh.id, wh.url, wh.secret, eventType, body, 3);
    }
  } catch {
    // never throw from webhook code
  }
}

async function sendWithRetry(
  webhookId: string,
  url: string,
  secret: string | undefined,
  eventType: WebhookEventType,
  body: string,
  maxAttempts: number,
): Promise<void> {
  let lastStatus = 0;
  let lastResponse = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Webhook-Event": eventType,
      };
      if (secret) {
        headers["X-Webhook-Secret"] = secret;
      }

      const res = await fetch(url, {
        method: "POST",
        headers,
        body,
      });

      lastStatus = res.status;
      try {
        lastResponse = await res.text();
      } catch {
        lastResponse = "";
      }

      if (res.ok) {
        addWebhookLog({
          id: `whl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          webhookId,
          eventType,
          url,
          status: "success",
          statusCode: lastStatus,
          attempts: attempt,
          payload: body,
          response: lastResponse.slice(0, 500),
          timestamp: Date.now(),
        });
        return;
      }

      // Non-2xx — retry after delay
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    } catch {
      lastStatus = 0;
      lastResponse = "Network error";
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }
    }
  }

  // All attempts failed
  addWebhookLog({
    id: `whl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    webhookId,
    eventType,
    url,
    status: "failed",
    statusCode: lastStatus || undefined,
    attempts: maxAttempts,
    payload: body,
    response: lastResponse.slice(0, 500),
    timestamp: Date.now(),
  });
}
