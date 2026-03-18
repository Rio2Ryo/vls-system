import { NextRequest, NextResponse } from "next/server";
import type { PhotoClassification } from "@/lib/types";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
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
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
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

  // Build Gemini image part
  let imagePart: Record<string, unknown>;

  if (imageUrl.startsWith("data:")) {
    const dataIdx = imageUrl.indexOf(";base64,");
    if (dataIdx <= 5) {
      return NextResponse.json({ error: "Invalid data URL format" }, { status: 400 });
    }
    const mimeType = imageUrl.slice(5, dataIdx);
    const base64Data = imageUrl.slice(dataIdx + 8);
    imagePart = {
      inlineData: { mimeType, data: base64Data },
    };
  } else {
    // For external URLs, fetch and convert to base64
    try {
      const imgRes = await fetch(imageUrl);
      if (!imgRes.ok) {
        return NextResponse.json({ error: "Failed to fetch image" }, { status: 400 });
      }
      const arrayBuf = await imgRes.arrayBuffer();
      const base64Data = Buffer.from(arrayBuf).toString("base64");
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";
      imagePart = {
        inlineData: { mimeType: contentType, data: base64Data },
      };
    } catch {
      return NextResponse.json({ error: "Failed to fetch image URL" }, { status: 400 });
    }
  }

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                imagePart,
                { text: CLASSIFY_PROMPT },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 100,
            temperature: 0.1,
          },
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`Gemini API error (${res.status}):`, errText);
      return NextResponse.json(
        { error: `Gemini API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const text: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

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
