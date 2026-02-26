import { NextRequest, NextResponse } from "next/server";
import { r2List, r2Delete, isR2Configured } from "@/lib/r2";
import { ADMIN_PASSWORD } from "@/lib/data";

export const runtime = "nodejs";

/**
 * GET /api/files?prefix=photos/&limit=200
 * List files in R2 bucket with optional prefix filter.
 * Optional x-tenant-id header to scope listing under tenant prefix.
 * Requires x-admin-password header.
 */
export async function GET(request: NextRequest) {
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
    const { searchParams } = new URL(request.url);
    const rawPrefix = searchParams.get("prefix") || undefined;
    const limit = parseInt(searchParams.get("limit") || "200", 10);
    const tenantId = request.headers.get("x-tenant-id") || null;

    // Scope prefix under tenant directory if tenant context is provided
    const prefix = tenantId
      ? rawPrefix ? `${tenantId}/${rawPrefix}` : `${tenantId}/`
      : rawPrefix;

    const result = await r2List(prefix, limit);

    return NextResponse.json({
      objects: result.objects,
      prefixes: result.prefixes,
      count: result.objects.length,
      tenantId: tenantId || undefined,
    });
  } catch (error) {
    console.error("List error:", error);
    return NextResponse.json(
      { error: "Failed to list files" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/files
 * Delete a file from R2.
 * Body: { key: string }
 * Optional x-tenant-id header — if set, validates key belongs to tenant.
 * Requires x-admin-password header.
 */
export async function DELETE(request: NextRequest) {
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
    const { key } = await request.json();
    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    // Prevent tenant from deleting other tenants' files
    const tenantId = request.headers.get("x-tenant-id") || null;
    if (tenantId && !key.startsWith(`${tenantId}/`)) {
      return NextResponse.json({ error: "Access denied: file does not belong to this tenant" }, { status: 403 });
    }

    const ok = await r2Delete(key);
    if (!ok) {
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }

    return NextResponse.json({ deleted: key });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 }
    );
  }
}
