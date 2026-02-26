import { NextRequest, NextResponse } from "next/server";
import { r2Put, isR2Configured } from "@/lib/r2";
import { ADMIN_PASSWORD } from "@/lib/data";

export const runtime = "nodejs";

/**
 * POST /api/upload
 * Accepts multipart FormData with:
 *   - file: the file to upload
 *   - eventId: (optional) event ID for organizing into folders
 *   - type: "photos" | "thumbs" | "videos" (default: "photos")
 *   - path: (optional) custom key path, overrides auto-generated key
 * Requires x-admin-password header for auth.
 * Optional x-tenant-id header to scope uploads under tenant prefix.
 */
export async function POST(request: NextRequest) {
  const adminPassword = request.headers.get("x-admin-password");
  if (adminPassword !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const eventId = formData.get("eventId") as string | null;
    const type = (formData.get("type") as string) || "photos";
    const customPath = formData.get("path") as string | null;
    const tenantId = request.headers.get("x-tenant-id") || null;

    if (!file) {
      return NextResponse.json(
        { error: "file is required" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const tenantPrefix = tenantId ? `${tenantId}/` : "";
    const key = customPath
      ? `${tenantPrefix}${customPath}`
      : eventId
        ? `${tenantPrefix}${type}/${eventId}/${timestamp}-${sanitizedName}`
        : `${tenantPrefix}${type}/${timestamp}-${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();
    await r2Put(key, arrayBuffer, file.type);

    return NextResponse.json({
      key,
      url: `/api/media/${key}`,
      size: arrayBuffer.byteLength,
      contentType: file.type,
      tenantId: tenantId || undefined,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
