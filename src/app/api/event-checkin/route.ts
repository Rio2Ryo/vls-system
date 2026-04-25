import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ParticipantRecord {
  id: string;
  eventId: string;
  tenantId?: string;
  name: string;
  email?: string;
  checkedIn: boolean;
  checkedInAt?: number;
  checkinToken?: string;
  registeredAt: number;
  [key: string]: unknown;
}

/**
 * POST /api/event-checkin
 * Body: { eventId: string, name: string }
 * Looks up participant by name in the given event, marks as checked-in.
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
    // Read participants from D1
    const rawParticipants = await d1Get("vls_participants");
    if (!rawParticipants) {
      return NextResponse.json({ error: "No participants data" }, { status: 404 });
    }



    const participants: ParticipantRecord[] = JSON.parse(rawParticipants);

    // Normalize for matching: trim, full-width→half-width, katakana→hiragana
    const normalize = (s: string) =>
      s.trim()
        .replace(/\s+/g, "")  // remove all whitespace
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))  // full-width → half-width
        .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))     // katakana → hiragana
        .toLowerCase();

    const normalizedInput = normalize(name);

    // Find matching participant in this event
    const eventParticipants = participants.filter((p) => p.eventId === eventId);
    const match = eventParticipants.find((p) => normalize(p.name) === normalizedInput);

    if (!match) {
      // Try partial match (input contains participant name or vice versa)
      const partialMatch = eventParticipants.find(
        (p) => normalizedInput.includes(normalize(p.name)) || normalize(p.name).includes(normalizedInput)
      );
      if (!partialMatch) {
        return NextResponse.json({ error: "not_found", message: "名前が見つかりません" }, { status: 404 });
      }
      // Use partial match
      return await processCheckin(partialMatch, participants, eventId);
    }

    return await processCheckin(match, participants, eventId);
  } catch (err) {
    console.error("[event-checkin API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

async function processCheckin(
  participant: ParticipantRecord,
  allParticipants: ParticipantRecord[],
  eventId: string
) {
  // Get event info
  let eventName = "";
  let eventDate = "";
  try {
    const rawEvents = await d1Get("vls_admin_events");
    if (rawEvents) {
      const events = JSON.parse(rawEvents);
      const evt = events.find((e: { id: string }) => e.id === eventId);
      if (evt) {
        eventName = evt.name || "";
        eventDate = evt.date || "";
      }
    }
  } catch { /* ignore */ }

  // Already checked in
  if (participant.checkedIn) {
    return NextResponse.json({
      status: "already",
      participantName: participant.name,
      eventName,
      eventDate,
      checkedInAt: participant.checkedInAt,
    });
  }

  // Perform check-in
  const now = Date.now();
  const updated = allParticipants.map((p) =>
    p.id === participant.id
      ? { ...p, checkedIn: true, checkedInAt: now }
      : p
  );

  await d1Set("vls_participants", JSON.stringify(updated));

  return NextResponse.json({
    status: "success",
    participantName: participant.name,
    eventName,
    eventDate,
    checkedInAt: now,
  });
}
