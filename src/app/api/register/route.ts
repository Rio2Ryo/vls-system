import { NextRequest, NextResponse } from "next/server";
import { d1Get, d1Set, isD1Configured } from "@/lib/d1";
import { Participant } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://vls-system.vercel.app";

/**
 * POST /api/register
 * Body: { eventId: string, name: string, email: string, phone?: string }
 *
 * Public registration form endpoint (no auth required).
 * 1. Validate event exists & registration is open
 * 2. Check capacity (maxParticipants)
 * 3. Check duplicate email within same event
 * 4. Add to vls_participants
 * 5. Send confirmation email (async, non-blocking)
 */
export async function POST(req: NextRequest) {
  if (!isD1Configured()) {
    return NextResponse.json({ error: "D1 not configured" }, { status: 503 });
  }

  let eventId: string;
  let name: string;
  let email: string;
  let phone: string;

  try {
    const body = await req.json();
    eventId = (body.eventId || "").trim();
    name = (body.name || "").trim();
    email = (body.email || "").trim().toLowerCase();
    phone = (body.phone || "").trim();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Validation
  if (!eventId || !name || !email) {
    return NextResponse.json({ error: "eventId, name, email are required" }, { status: 400 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
  }

  try {
    // --- 1. Get event info & check registration status ---
    const rawEvents = await d1Get("vls_admin_events");
    if (!rawEvents) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }
    const events = JSON.parse(rawEvents);
    const event = events.find((e: { id: string }) => e.id === eventId);
    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    // Check if registration is open
    if (!event.registrationOpen) {
      return NextResponse.json({
        error: "registration_closed",
        message: "申し込み受付は終了しています",
      }, { status: 403 });
    }

    // Check deadline (auto-close: deadline day is inclusive, close at end of day)
    if (event.registrationDeadline) {
      const deadlineEnd = new Date(event.registrationDeadline + "T23:59:59+09:00").getTime();
      if (Date.now() > deadlineEnd) {
        return NextResponse.json({
          error: "registration_deadline_passed",
          message: "申し込み期限を過ぎています",
        }, { status: 403 });
      }
    }

    // --- 2. Get current participants ---
    const rawParticipants = await d1Get("vls_participants");
    const allParticipants: Participant[] = rawParticipants ? JSON.parse(rawParticipants) : [];
    const eventParticipants = allParticipants.filter((p) => p.eventId === eventId);

    // Check capacity
    if (event.maxParticipants && event.maxParticipants > 0) {
      if (eventParticipants.length >= event.maxParticipants) {
        return NextResponse.json({
          error: "registration_full",
          message: "定員に達したため受付を終了しました",
          currentCount: eventParticipants.length,
          maxParticipants: event.maxParticipants,
        }, { status: 403 });
      }
    }

    // --- 3. Duplicate email check ---
    const normalizeEmail = (e: string) => e.trim().toLowerCase();
    const duplicate = eventParticipants.find(
      (p) => p.email && normalizeEmail(p.email) === normalizeEmail(email)
    );
    if (duplicate) {
      return NextResponse.json({
        error: "duplicate_email",
        message: "このメールアドレスは既に登録されています",
        participantName: duplicate.name,
      }, { status: 409 });
    }

    // --- 4. Create participant ---
    const now = Date.now();
    const checkinToken = `ct-${now}-${Math.random().toString(36).slice(2, 8)}`;
    const newParticipant: Participant = {
      id: `p-${now}-${Math.random().toString(36).slice(2, 6)}`,
      eventId,
      tenantId: event.tenantId || undefined,
      name,
      email,
      phone: phone || undefined,
      registeredAt: now,
      checkedIn: false,
      checkinToken,
      source: "form",
    };

    allParticipants.push(newParticipant);
    await d1Set("vls_participants", JSON.stringify(allParticipants));

    // --- 5. Send confirmation email (fire & forget) ---
    try {
      const confirmUrl = `${APP_URL}/api/send-registration-confirm`;
      fetch(confirmUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name,
          phone: phone || undefined,
          eventName: event.name || "",
          eventDate: event.date || "",
          eventVenue: event.venue || "",
          checkinToken,
        }),
      }).catch((err) => {
        console.error("[register] Confirmation email failed:", err);
      });
    } catch {
      // Non-blocking — ignore email errors
    }

    return NextResponse.json({
      status: "success",
      participantId: newParticipant.id,
      participantName: name,
      eventName: event.name || "",
      eventDate: event.date || "",
      eventVenue: event.venue || "",
      currentCount: eventParticipants.length + 1,
      maxParticipants: event.maxParticipants || null,
    });
  } catch (err) {
    console.error("[register API] Error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
