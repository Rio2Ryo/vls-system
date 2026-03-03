import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

const SCORE_PROMPT = `この写真の品質を0〜100点で採点してください。以下の3つの観点で評価します:
- sharpness: ピントの鮮明さ（ブレ・ボケの少なさ）
- exposure: 露出の適切さ（明るすぎ/暗すぎでない）
- composition: 構図の良さ（被写体の配置、バランス）

必ず以下のJSON形式のみで回答してください（説明不要）:
{"sharpness":85,"exposure":90,"composition":75,"total":83}

totalは3項目の加重平均です（sharpness 40%, exposure 30%, composition 30%）。`;

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
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              imageBlock,
              { type: "text", text: SCORE_PROMPT },
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
