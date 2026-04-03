import { NextRequest, NextResponse } from "next/server";
import { d1Get } from "@/lib/d1";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const eventId = searchParams.get("eventId");
  if (!eventId) return NextResponse.json({ error: "eventId required" }, { status: 400 });

  const eventsJson = await d1Get("vls_admin_events").catch(() => null);
  if (!eventsJson) return NextResponse.json({ error: "vls_admin_events not found" }, { status: 404 });

  const events = JSON.parse(eventsJson) as Array<{
    id: string;
    photos?: Array<{ id: string; originalUrl?: string; thumbnailUrl?: string; url?: string }>;
  }>;
  const event = events.find((e) => e.id === eventId);
  if (!event) return NextResponse.json({ error: `Event "${eventId}" not found` }, { status: 404 });

  const photos = (event.photos || []).map((p) => ({
    photoId: p.id,
    url: p.originalUrl || p.thumbnailUrl || p.url || "",
  })).filter((p) => p.url);

  return NextResponse.json({ photos, count: photos.length });
}
