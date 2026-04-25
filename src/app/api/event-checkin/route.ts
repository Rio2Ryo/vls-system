import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/event-checkin
 * Body: { eventId: string, name: string }
 *
 * Hybrid check-in:
 * 1. ALWAYS create a walk-in record (来場記録) with timestamp
 * 2. ALSO try to match against pre-registered participants → auto check-in if matched
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
    // --- Get event info ---
    let eventName = "";
    let eventDate = "";
    let eventTenantId: string | undefined;
    try {
      const rawEvents = await d1Get("vls_admin_events");
      if (rawEvents) {
        const events = JSON.parse(rawEvents);
        const evt = events.find((e: { id: string }) => e.id === eventId);
        if (evt) {
          eventName = evt.name || "";
          eventDate = evt.date || "";
          eventTenantId = evt.tenantId;
        }
      }
    } catch { /* ignore */ }

    // --- Read existing participants ---
    const rawParticipants = await d1Get("vls_participants");
    const participants: Record<string, unknown>[] = rawParticipants ? JSON.parse(rawParticipants) : [];

    // --- Normalize helper ---
    const normalize = (s: string) =>
      s.trim()
        .replace(/\s+/g, "")
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
        .toLowerCase();

    const normalizedInput = normalize(name);
    const now = Date.now();

    // --- 1. Always create walk-in record (来場記録) ---
    // Check for duplicate walk-in (same name, same event, within last 5 minutes)
    const recentDuplicate = participants.find(
      (p) =>
        p.eventId === eventId &&
        p.walkIn === true &&
        normalize(String(p.name || "")) === normalizedInput &&
        typeof p.checkedInAt === "number" &&
        now - (p.checkedInAt as number) < 5 * 60 * 1000
    );

    if (recentDuplicate) {
      // Same person within 5 min — don't create duplicate
      return NextResponse.json({
        status: "already",
        participantName: recentDuplicate.name,
        eventName,
        eventDate,
        checkedInAt: recentDuplicate.checkedInAt,
        matched: recentDuplicate.matchedParticipantId ? true : false,
        matchedName: recentDuplicate.matchedParticipantName || null,
      });
    }

    // --- 2. Try to match against pre-registered participants ---
    const preRegistered = participants.filter(
      (p) => p.eventId === eventId && !p.walkIn
    );

    // Exact match first, then partial
    let matchedParticipant = preRegistered.find(
      (p) => normalize(String(p.name || "")) === normalizedInput
    );
    if (!matchedParticipant) {
      matchedParticipant = preRegistered.find(
        (p) =>
          normalizedInput.includes(normalize(String(p.name || ""))) ||
          normalize(String(p.name || "")).includes(normalizedInput)
      );
    }

    // If matched, mark the pre-registered participant as checked-in
    let matched = false;
    let matchedName: string | null = null;
    if (matchedParticipant && !matchedParticipant.checkedIn) {
      matchedParticipant.checkedIn = true;
      matchedParticipant.checkedInAt = now;
      matched = true;
      matchedName = String(matchedParticipant.name || "");
    } else if (matchedParticipant && matchedParticipant.checkedIn) {
      matched = true;
      matchedName = String(matchedParticipant.name || "");
    }

    // --- 3. Create walk-in record ---
    const walkInId = `w-${now}-${Math.random().toString(36).slice(2, 6)}`;
    const walkInRecord: Record<string, unknown> = {
      id: walkInId,
      eventId,
      tenantId: eventTenantId,
      name,
      registeredAt: now,
      checkedIn: true,
      checkedInAt: now,
      walkIn: true,
    };

    // Link to matched participant if found
    if (matchedParticipant) {
      walkInRecord.matchedParticipantId = matchedParticipant.id;
      walkInRecord.matchedParticipantName = matchedParticipant.name;
    }

    participants.push(walkInRecord);

    // --- Save to D1 ---
    await d1Set("vls_participants", JSON.stringify(participants));

    return NextResponse.json({
      status: "success",
      participantName: name,
      eventName,
      eventDate,
      checkedInAt: now,
      matched,
      matchedName,
    });
  } catch (err) {
    console.error("[event-checkin API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
