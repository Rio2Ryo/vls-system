import { NextRequest, NextResponse } from "next/server";
import { createPresignToken, isR2Configured } from "@/lib/r2";
import { ADMIN_PASSWORD } from "@/lib/data";

export const runtime = "nodejs";

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
    const { eventId, fileName, contentType, type } = await request.json();

    if (!eventId || !fileName || !contentType) {
      return NextResponse.json(
        { error: "eventId, fileName, and contentType are required" },
        { status: 400 }
      );
    }

    const prefix = type === "thumbs" ? "thumbs" : "photos";
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${prefix}/${eventId}/${Date.now()}-${sanitizedName}`;
    const token = createPresignToken(key, contentType);

    return NextResponse.json({
      token,
      key,
      uploadUrl: `/api/presigned-upload`,
      mediaUrl: `/api/media/${key}`,
    });
  } catch (error) {
    console.error("Presign error:", error);
    return NextResponse.json(
      { error: "Failed to create presigned URL" },
      { status: 500 }
    );
  }
}
