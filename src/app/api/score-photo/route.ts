import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const SCORE_PROMPT = `この写真の品質を0〜100点で採点してください。以下の3つの観点で評価します:
- sharpness: ピントの鮮明さ（ブレ・ボケの少なさ）
- exposure: 露出の適切さ（明るすぎ/暗すぎでない）
- composition: 構図の良さ（被写体の配置、バランス）

必ず以下のJSON形式のみで回答してください（説明不要）:
{"sharpness":85,"exposure":90,"composition":75,"total":83}

totalは3項目の加重平均です（sharpness 40%, exposure 30%, composition 30%）。`;

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
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
                { text: SCORE_PROMPT },
              ],
            },
          ],
          generationConfig: {
            maxOutputTokens: 150,
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
        { status: 502 },
      );
    }

    const data = await res.json();
    const text: string =
      data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = text.match(/\{[^}]+\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const clamp = (v: unknown) =>
          typeof v === "number" ? Math.min(100, Math.max(0, Math.round(v))) : 50;
        const sharpness = clamp(parsed.sharpness);
        const exposure = clamp(parsed.exposure);
        const composition = clamp(parsed.composition);
        const total = clamp(parsed.total) || Math.round(sharpness * 0.4 + exposure * 0.3 + composition * 0.3);
        return NextResponse.json({ sharpness, exposure, composition, total });
      } catch {
        // JSON parse failed
      }
    }

    return NextResponse.json({ sharpness: 50, exposure: 50, composition: 50, total: 50 });
  } catch (err) {
    console.error("Scoring error:", err);
    return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
  }
}
