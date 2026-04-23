import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/checkin/[token]
 * Server-side check-in by personal QR token.
 * Looks up participant in D1, marks as checked-in.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  const { token } = params;
  if (!token || token.length < 8) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    // Fetch participants from D1
    const dbRes = await fetch(new URL("/api/db?key=vls_participants", req.url));
    if (!dbRes.ok) {
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    const dbData = await dbRes.json();
    if (!dbData.value) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    const participants: ParticipantRecord[] = JSON.parse(dbData.value);
    const participant = participants.find((p) => p.checkinToken === token);

    if (!participant) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Already checked in
    if (participant.checkedIn) {
      // Fetch event name
      let eventName = "";
      let eventDate = "";
      try {
        const evtRes = await fetch(new URL("/api/db?key=vls_admin_events", req.url));
        if (evtRes.ok) {
          const evtData = await evtRes.json();
          if (evtData.value) {
            const events = JSON.parse(evtData.value);
            const evt = events.find((e: { id: string }) => e.id === participant.eventId);
            if (evt) {
              eventName = evt.name;
              eventDate = evt.date || "";
            }
          }
        }
      } catch { /* ignore */ }

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

    // Perform check-in
    const now = Date.now();
    const updated = participants.map((p) =>
      p.id === participant.id
        ? { ...p, checkedIn: true, checkedInAt: now }
        : p
    );

    // Save to D1
    await fetch(new URL("/api/db", req.url), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "vls_participants",
        value: JSON.stringify(updated),
      }),
    });

    // Fetch event name
    let eventName = "";
    let eventDate = "";
    try {
      const evtRes = await fetch(new URL("/api/db?key=vls_admin_events", req.url));
      if (evtRes.ok) {
        const evtData = await evtRes.json();
        if (evtData.value) {
          const events = JSON.parse(evtData.value);
          const evt = events.find((e: { id: string }) => e.id === participant.eventId);
          if (evt) {
            eventName = evt.name;
            eventDate = evt.date || "";
          }
        }
      }
    } catch { /* ignore */ }

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
