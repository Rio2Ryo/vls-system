import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";

export const dynamic = "force-dynamic";
export const revalidate = 0;
/**
 * POST /api/checkin/[token]
 * Server-side check-in by personal QR token.
 * Directly reads/writes D1 (no internal API calls that would be blocked by CSRF/auth).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  try {
    // Read participants directly from D1
    const rawParticipants = await d1Get("vls_participants");
    if (!rawParticipants) {
      return NextResponse.json({ error: "No participants data" }, { status: 404 });
    }

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
    }

    const participants: ParticipantRecord[] = JSON.parse(rawParticipants);
    const participant = participants.find((p) => p.checkinToken === token);

    if (!participant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Read event info directly from D1
    let eventName = "";
    let eventDate = "";
    try {
      const rawEvents = await d1Get("vls_admin_events");
      if (rawEvents) {
        const events = JSON.parse(rawEvents);
        const evt = events.find((e: { id: string }) => e.id === participant.eventId);
        if (evt) {
          eventName = evt.name || "";
          eventDate = evt.date || "";
        }
      }
    } catch { /* ignore */ }

    // Already checked in
    if (participant.checkedIn) {
      return NextResponse.json({
        alreadyCheckedIn: true,
        participantId: participant.id,
        participantName: participant.name,
        eventId: participant.eventId,
        eventName,
        eventDate,
        checkedInAt: participant.checkedInAt,
      });
    }

    // Perform check-in: update in D1 directly
    const now = Date.now();
    const updated = participants.map((p) =>
      p.id === participant.id
        ? { ...p, checkedIn: true, checkedInAt: now }
        : p
    );

    await d1Set("vls_participants", JSON.stringify(updated));

    return NextResponse.json({
      alreadyCheckedIn: false,
      participantId: participant.id,
      participantName: participant.name,
      eventId: participant.eventId,
      eventName,
      eventDate,
      checkedInAt: now,
    });
  } catch (err) {
    console.error("[checkin API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
