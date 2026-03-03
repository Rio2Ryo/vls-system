import { AuditAction, AuditLog } from "./types";
import { addAuditLog } from "./store";

/**
 * Record an admin audit log entry.
 * Saves to localStorage + D1 (via store). Fire-and-forget.
 */
export function logAudit(
  action: AuditAction,
  target: { type: string; id?: string; name?: string },
  details?: Record<string, unknown>,
): void {
  // Get actor from session storage (set on admin login)
  const actor = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem("adminUser") || sessionStorage.getItem("tenantId") || "admin"
    : "admin";

  const tenantId = typeof sessionStorage !== "undefined"
    ? sessionStorage.getItem("tenantId") || undefined
    : undefined;

  const log: AuditLog = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    action,
    actor,
    targetType: target.type,
    targetId: target.id,
    targetName: target.name,
    details: details ? JSON.stringify(details) : undefined,
    tenantId,
  };

  addAuditLog(log);
}
