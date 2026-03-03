import { NextRequest, NextResponse } from "next/server";
import { SponsorReportShare } from "@/lib/types";
import { d1Get, d1Set } from "@/lib/d1";
import { logError } from "@/lib/errorLog";

export const runtime = "nodejs";

const KV_KEY = "vls_report_shares";

/**
 * POST — Create a new sponsor report share link (30-day expiry).
 * Body: { companyId?, companyName?, eventId?, eventName?, dateFrom?, dateTo?, tenantId?, createdBy }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { companyId, companyName, eventId, eventName, dateFrom, dateTo, tenantId, createdBy } = body as {
      companyId?: string;
      companyName?: string;
      eventId?: string;
      eventName?: string;
      dateFrom?: string;
      dateTo?: string;
      tenantId?: string;
      createdBy?: string;
    };

    const token = crypto.randomUUID();
    const now = Date.now();
    const record: SponsorReportShare = {
      id: `rpt-${now}-${Math.random().toString(36).slice(2, 6)}`,
      token,
      companyId: companyId || undefined,
      companyName: companyName || undefined,
      eventId: eventId || undefined,
      eventName: eventName || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      tenantId: tenantId || undefined,
      createdBy: createdBy || "admin",
      createdAt: now,
      expiresAt: now + 30 * 24 * 60 * 60 * 1000, // 30 days
      viewCount: 0,
    };

    // Save to D1
    let shares: SponsorReportShare[] = [];
    try {
      const raw = await d1Get(KV_KEY);
      if (raw) shares = JSON.parse(raw);
    } catch { /* empty */ }
    shares.push(record);
    await d1Set(KV_KEY, JSON.stringify(shares));

    return NextResponse.json({ success: true, token, expiresAt: record.expiresAt });
  } catch (err) {
    logError({ route: "/api/sponsor-report POST", error: err });
    return NextResponse.json({ error: "Failed to create share link" }, { status: 500 });
  }
}

/**
 * GET — Validate report token + return report data (companies, videoPlays, analytics).
 * GET /api/sponsor-report?token=xxx
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  try {
    // Look up share record
    const raw = await d1Get(KV_KEY);
    if (!raw) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const shares: SponsorReportShare[] = JSON.parse(raw);
    const idx = shares.findIndex((s) => s.token === token);
    if (idx === -1) return NextResponse.json({ error: "Invalid token" }, { status: 404 });

    const record = shares[idx];
    if (record.expiresAt < Date.now()) {
      return NextResponse.json({ error: "Token expired" }, { status: 410 });
    }

    // Increment view count
    shares[idx] = { ...record, viewCount: record.viewCount + 1 };
    d1Set(KV_KEY, JSON.stringify(shares)).catch(() => {});

    // Fetch data from D1
    const [rawCompanies, rawVideoPlays, rawAnalytics, rawEvents] = await Promise.all([
      d1Get("vls_admin_companies"),
      d1Get("vls_video_plays"),
      d1Get("vls_analytics"),
      d1Get("vls_admin_events"),
    ]);

    const companies = rawCompanies ? JSON.parse(rawCompanies) : [];
    let videoPlays = rawVideoPlays ? JSON.parse(rawVideoPlays) : [];
    let analytics = rawAnalytics ? JSON.parse(rawAnalytics) : [];
    const events = rawEvents ? JSON.parse(rawEvents) : [];

    // Apply filters from share record
    if (record.companyId) {
      videoPlays = videoPlays.filter((v: { companyId: string }) => v.companyId === record.companyId);
    }
    if (record.eventId) {
      videoPlays = videoPlays.filter((v: { eventId: string }) => v.eventId === record.eventId);
      analytics = analytics.filter((a: { eventId: string }) => a.eventId === record.eventId);
    }
    if (record.dateFrom) {
      const from = new Date(record.dateFrom).getTime();
      videoPlays = videoPlays.filter((v: { timestamp: number }) => v.timestamp >= from);
      analytics = analytics.filter((a: { timestamp: number }) => a.timestamp >= from);
    }
    if (record.dateTo) {
      const to = new Date(record.dateTo).getTime() + 86400000;
      videoPlays = videoPlays.filter((v: { timestamp: number }) => v.timestamp < to);
      analytics = analytics.filter((a: { timestamp: number }) => a.timestamp < to);
    }

    return NextResponse.json({
      share: {
        companyId: record.companyId,
        companyName: record.companyName,
        eventId: record.eventId,
        eventName: record.eventName,
        dateFrom: record.dateFrom,
        dateTo: record.dateTo,
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
        viewCount: record.viewCount + 1,
      },
      companies,
      videoPlays,
      analytics,
      events,
    });
  } catch (err) {
    logError({ route: "/api/sponsor-report GET", error: err });
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
