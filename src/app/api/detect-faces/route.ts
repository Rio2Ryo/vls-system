import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const DETECT_PROMPT = `この写真に写っている人物の顔を検出してください。
各人物について簡潔な特徴を述べてください（髪型、服装の色、位置など）。

必ず以下のJSON形式のみで回答してください（説明不要）:
{"faceCount":2,"descriptions":["左側: 黒髪ショート、赤いTシャツ","右側: 茶髪ロング、白いワンピース"]}

人物が写っていない場合: {"faceCount":0,"descriptions":[]}`;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: { imageUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { imageUrl } = body;
  if (!imageUrl || typeof imageUrl !== "string") {
    return NextResponse.json({ error: "imageUrl required" }, { status: 400 });
  }

  let imageBlock: Record<string, unknown>;
  if (imageUrl.startsWith("data:")) {
    const dataIdx = imageUrl.indexOf(";base64,");
    const match = dataIdx > 5
      ? [imageUrl, imageUrl.slice(5, dataIdx), imageUrl.slice(dataIdx + 8)]
      : null;
    if (!match) {
      return NextResponse.json({ error: "Invalid data URL format" }, { status: 400 });
    }
    imageBlock = {
      type: "image",
      source: { type: "base64", media_type: match[1], data: match[2] },
    };
  } else {
    imageBlock = {
      type: "image",
      source: { type: "url", url: imageUrl },
    };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              { type: "text", text: DETECT_PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Anthropic API error (${res.status}):`, errText);
      return NextResponse.json(
        { error: `Anthropic API error: ${res.status}` },
        { status: 502 },
      );
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const faceCount = typeof parsed.faceCount === "number" ? Math.max(0, parsed.faceCount) : 0;
        const descriptions = Array.isArray(parsed.descriptions)
          ? parsed.descriptions.filter((d: unknown) => typeof d === "string")
          : [];
        return NextResponse.json({ faceCount, descriptions });
      } catch {
        // JSON parse failed
      }
    }

    return NextResponse.json({ faceCount: 0, descriptions: [] });
  } catch (err) {
    console.error("Face detection error:", err);
    return NextResponse.json({ error: "Face detection failed" }, { status: 500 });
  }
}
