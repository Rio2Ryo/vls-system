import { NextRequest, NextResponse } from "next/server";
import { r2Get, isR2Configured } from "@/lib/r2";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } }
) {
  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 }
    );
  }

  const key = params.key.join("/");

  try {
    const result = await r2Get(key);

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return new NextResponse(result.body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (error) {
    console.error("Media fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch media" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
