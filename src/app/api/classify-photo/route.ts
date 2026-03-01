import { NextRequest, NextResponse } from "next/server";
import type { PhotoClassification } from "@/lib/types";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";
const VALID_TYPES: PhotoClassification[] = ["portrait", "group", "venue", "activity", "other"];

const CLASSIFY_PROMPT = `この写真を以下のカテゴリの1つに分類してください:
- portrait: 1〜2人の個人写真・ポートレート
- group: 3人以上のグループ写真
- venue: 会場・施設・風景の写真（人が主体でない）
- activity: アクティビティ・動きのある写真（スポーツ、ダンス、工作等）
- other: 上記に当てはまらない写真

必ず以下のJSON形式のみで回答してください（説明不要）:
{"classification":"カテゴリ名","confidence":0.95}`;

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
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

  // Build image content block for Claude Vision
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
    // External URL — pass directly
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
        max_tokens: 100,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              { type: "text", text: CLASSIFY_PROMPT },
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
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string = data.content?.[0]?.text || "";

    // Extract JSON from response
    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const classification: PhotoClassification =
          VALID_TYPES.includes(parsed.classification) ? parsed.classification : "other";
        const confidence =
          typeof parsed.confidence === "number"
            ? Math.min(1, Math.max(0, parsed.confidence))
            : 0.5;
        return NextResponse.json({ classification, confidence });
      } catch {
        // JSON parse failed — fall through
      }
    }

    return NextResponse.json({ classification: "other" as PhotoClassification, confidence: 0.5 });
  } catch (err) {
    console.error("Classification error:", err);
    return NextResponse.json({ error: "Classification failed" }, { status: 500 });
  }
}
