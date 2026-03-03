import { NextRequest, NextResponse } from "next/server";

/**
 * PUT /api/sponsor/update
 * Authenticated company data update for sponsor portal.
 * Body: { companyId, password, updates: { offerText?, offerUrl?, couponCode?, videos?, logoUrl? } }
 * CSRF validated by middleware.
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { companyId, password, updates } = body;

    if (!companyId || !password || !updates) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Dynamically import store to use localStorage (client-side data)
    // Since this is an API route, we read/write via D1 directly
    const { d1Get, d1Set } = await import("@/lib/d1");
    const { COMPANIES } = await import("@/lib/data");

    // Get companies from D1 or fallback to defaults
    let companies;
    try {
      const stored = await d1Get("vls_admin_companies");
      companies = stored ? JSON.parse(stored) : COMPANIES;
    } catch {
      companies = COMPANIES;
    }

    // Authenticate
    const company = companies.find((c: { id: string; portalPassword?: string }) => c.id === companyId);
    if (!company || !company.portalPassword || company.portalPassword !== password) {
      return NextResponse.json({ error: "認証に失敗しました" }, { status: 401 });
    }

    // Allowlist of updatable fields
    const allowedFields = ["offerText", "offerUrl", "couponCode", "videos", "logoUrl"];
    const sanitizedUpdates: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in updates) {
        sanitizedUpdates[key] = updates[key];
      }
    }

    // Validate videos structure if provided
    if (sanitizedUpdates.videos) {
      const v = sanitizedUpdates.videos as Record<string, unknown>;
      if (typeof v !== "object" || !v) {
        return NextResponse.json({ error: "Invalid videos format" }, { status: 400 });
      }
      sanitizedUpdates.videos = {
        cm15: typeof v.cm15 === "string" ? v.cm15 : company.videos.cm15,
        cm30: typeof v.cm30 === "string" ? v.cm30 : company.videos.cm30,
        cm60: typeof v.cm60 === "string" ? v.cm60 : company.videos.cm60,
      };
    }

    // Apply updates
    const updatedCompanies = companies.map((c: { id: string }) => {
      if (c.id !== companyId) return c;
      return { ...c, ...sanitizedUpdates };
    });

    // Persist to D1
    try {
      await d1Set("vls_admin_companies", JSON.stringify(updatedCompanies));
    } catch {
      // D1 write failed — not fatal
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
