import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** GET /api/audit — list all audit logs from D1 */
export async function GET(req: NextRequest) {
  try {
    const dbRes = await fetch(new URL("/api/db?key=vls_audit_log", req.url));
    if (!dbRes.ok) return NextResponse.json([]);
    const data = await dbRes.json();
    if (data.value) {
      return NextResponse.json(JSON.parse(data.value));
    }
    return NextResponse.json([]);
  } catch {
    return NextResponse.json([]);
  }
}

/** POST /api/audit — record a new audit log entry */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.action || !body.actor) {
    return NextResponse.json({ error: "action and actor required" }, { status: 400 });
  }

  // Fetch existing logs
  let logs: Array<Record<string, unknown>> = [];
  try {
    const dbRes = await fetch(new URL("/api/db?key=vls_audit_log", req.url));
    if (dbRes.ok) {
      const data = await dbRes.json();
      if (data.value) logs = JSON.parse(data.value);
    }
  } catch {
    // Continue with empty
  }

  const entry = {
    id: body.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: body.timestamp || Date.now(),
    action: body.action,
    actor: body.actor,
    targetType: body.targetType || "",
    targetId: body.targetId,
    targetName: body.targetName,
    details: body.details,
    tenantId: body.tenantId,
  };

  logs.unshift(entry);
  if (logs.length > 1000) logs.length = 1000;

  // Persist to D1
  try {
    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "vls_audit_log", value: JSON.stringify(logs) }),
    });
  } catch {
    // D1 save failed
  }

  return NextResponse.json({ success: true, entry });
}
