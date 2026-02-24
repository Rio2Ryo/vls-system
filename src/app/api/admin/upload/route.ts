import { NextRequest, NextResponse } from "next/server";
import { r2Put, isR2Configured } from "@/lib/r2";
import { ADMIN_PASSWORD } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  // Admin auth check
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
    const type = (formData.get("type") as string) || "photos"; // "photos" or "thumbs"

    if (!file || !eventId) {
      return NextResponse.json(
        { error: "file and eventId are required" },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${type}/${eventId}/${timestamp}-${sanitizedName}`;

    const arrayBuffer = await file.arrayBuffer();

    await r2Put(key, arrayBuffer, file.type);

    return NextResponse.json({
      key,
      url: `/api/media/${key}`,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
