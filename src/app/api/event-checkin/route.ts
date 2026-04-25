import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/event-checkin
 * Body: { eventId: string, name: string }
 *
 * Hybrid check-in:
 * 1. ALWAYS save a walk-in log entry (来場記録) in vls_walkin_log — separate from participants
 * 2. Try to match against pre-registered participants (vls_participants) → auto check-in if matched
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

    // --- Normalize helper ---
    const normalize = (s: string) =>
      s.trim()
        .replace(/\s+/g, "")
        .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
        .replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
        .toLowerCase();

    const normalizedInput = normalize(name);
    const now = Date.now();

    // --- 1. Walk-in log (来場記録) — separate storage ---
    const rawLog = await d1Get("vls_walkin_log");
    const walkInLog: Record<string, unknown>[] = rawLog ? JSON.parse(rawLog) : [];

    // Check for duplicate within 5 minutes
    const recentDuplicate = walkInLog.find(
      (entry) =>
        entry.eventId === eventId &&
        normalize(String(entry.name || "")) === normalizedInput &&
        typeof entry.timestamp === "number" &&
        now - (entry.timestamp as number) < 5 * 60 * 1000
    );

    if (recentDuplicate) {
      return NextResponse.json({
        status: "already",
        participantName: recentDuplicate.name,
        eventName,
        eventDate,
        checkedInAt: recentDuplicate.timestamp,
      });
    }

    // --- 2. Try to match against pre-registered participants ---
    const rawParticipants = await d1Get("vls_participants");
    const participants: Record<string, unknown>[] = rawParticipants ? JSON.parse(rawParticipants) : [];

    const preRegistered = participants.filter((p) => p.eventId === eventId);

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

    // If matched and not yet checked in, mark as checked-in
    let matched = false;
    let matchedName: string | null = null;
    let participantsChanged = false;

    if (matchedParticipant) {
      matchedName = String(matchedParticipant.name || "");
      matched = true;
      if (!matchedParticipant.checkedIn) {
        matchedParticipant.checkedIn = true;
        matchedParticipant.checkedInAt = now;
        participantsChanged = true;
      }
    }

    // --- 3. Save walk-in log entry ---
    const logEntry: Record<string, unknown> = {
      id: `wl-${now}-${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      name,
      timestamp: now,
      matched,
      matchedParticipantId: matchedParticipant ? matchedParticipant.id : null,
      matchedParticipantName: matchedName,
    };
    walkInLog.push(logEntry);

    // --- 4. Save to D1 ---
    await d1Set("vls_walkin_log", JSON.stringify(walkInLog));
    if (participantsChanged) {
      await d1Set("vls_participants", JSON.stringify(participants));
    }

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
