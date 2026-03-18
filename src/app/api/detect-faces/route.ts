import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

const DETECT_PROMPT = `この写真に写っている人物の顔を検出してください。
各人物について簡潔な特徴を述べてください（髪型、服装の色、位置など）。

必ず以下のJSON形式のみで回答してください（説明不要）:
{"faceCount":2,"descriptions":["左側: 黒髪ショート、赤いTシャツ","右側: 茶髪ロング、白いワンピース"]}

人物が写っていない場合: {"faceCount":0,"descriptions":[]}`;

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
                { text: DETECT_PROMPT },
              ],
            },
          ],
          generationConfig: { maxOutputTokens: 300, temperature: 0.1 },
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
