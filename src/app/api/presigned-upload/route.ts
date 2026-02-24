import { NextRequest, NextResponse } from "next/server";
import { verifyPresignToken, r2Put, isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 }
    );
  }

  const token = request.headers.get("x-upload-token");
  if (!token) {
    return NextResponse.json(
      { error: "Missing x-upload-token header" },
      { status: 401 }
    );
  }

  const payload = verifyPresignToken(token);
  if (!payload) {
    return NextResponse.json(
      { error: "Invalid or expired token" },
      { status: 403 }
    );
  }

  try {
    const body = await request.arrayBuffer();
    await r2Put(payload.key, body, payload.contentType);

    return NextResponse.json({
      key: payload.key,
      url: `/api/media/${payload.key}`,
    });
  } catch (error) {
    console.error("Presigned upload error:", error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
