import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/event-checkin
 * Body: { eventId: string, name: string }
 * Open check-in: anyone can check in by entering their name.
 * Creates a new participant record and marks as checked-in immediately.
 * If the same name already checked in, returns "already".
 */
export async function POST(req: NextRequest) {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  let eventId: string;
  let name: string;
  try {
    const body = await req.json();
    eventId = (body.eventId || "").trim();
    name = (body.name || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!eventId || !name) {
    return NextResponse.json({ error: "eventId and name are required" }, { status: 400 });
  }

  try {
    // Read existing participants from D1
    const rawParticipants = await d1Get("vls_participants");
    const participants: Record<string, unknown>[] = rawParticipants ? JSON.parse(rawParticipants) : [];

    // Normalize for duplicate check
    const normalize = (s: string) =>
      s.trim()
        .replace(/\s+/g, "")
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
        .toLowerCase();

    const normalizedInput = normalize(name);

    // Check if same name already checked in for this event
    const existing = participants.find(
      (p) => p.eventId === eventId && normalize(String(p.name || "")) === normalizedInput && p.checkedIn === true
    );

    if (existing) {
      // Get event info
      const { eventName, eventDate } = await getEventInfo(eventId);
      return NextResponse.json({
        status: "already",
        participantName: existing.name,
        eventName,
        eventDate,
        checkedInAt: existing.checkedInAt,
      });
    }

    // Create new walk-in participant entry
    const now = Date.now();
    const id = `p-${now}-${Math.random().toString(36).slice(2, 6)}`;

    // Get tenant info from event
    let tenantId: string | undefined;
    const { eventName, eventDate } = await getEventInfo(eventId);
    try {
      const rawEvents = await d1Get("vls_admin_events");
      if (rawEvents) {
        const events = JSON.parse(rawEvents);
        const evt = events.find((e: { id: string }) => e.id === eventId);
        if (evt) tenantId = evt.tenantId;
      }
    } catch { /* ignore */ }

    const newParticipant = {
      id,
      eventId,
      tenantId,
      name,
      registeredAt: now,
      checkedIn: true,
      checkedInAt: now,
      walkIn: true,  // flag to identify walk-in entries
    };

    participants.push(newParticipant);
    await d1Set("vls_participants", JSON.stringify(participants));

    return NextResponse.json({
      status: "success",
      participantName: name,
      eventName,
      eventDate,
      checkedInAt: now,
    });
  } catch (err) {
    console.error("[event-checkin API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function getEventInfo(eventId: string): Promise<{ eventName: string; eventDate: string }> {
  try {
    const rawEvents = await d1Get("vls_admin_events");
    if (rawEvents) {
      const events = JSON.parse(rawEvents);
      const evt = events.find((e: { id: string }) => e.id === eventId);
      if (evt) return { eventName: evt.name || "", eventDate: evt.date || "" };
    }
  } catch { /* ignore */ }
  return { eventName: "", eventDate: "" };
}
