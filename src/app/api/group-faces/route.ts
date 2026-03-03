import { NextRequest, NextResponse } from "next/server";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

interface PhotoFace {
  photoId: string;
  descriptions: string[];
}

export async function POST(req: NextRequest) {
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 },
    );
  }

  let body: { photos?: PhotoFace[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { photos } = body;
  if (!photos || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "photos array required" }, { status: 400 });
  }

  // Build description list for Claude
  const photoList = photos
    .filter((p) => p.descriptions && p.descriptions.length > 0)
    .map((p) => `写真ID: ${p.photoId}\n人物: ${p.descriptions.join(" / ")}`)
    .join("\n\n");

  if (!photoList) {
    return NextResponse.json({ groups: [] });
  }

  const groupPrompt = `以下の写真リストの人物の特徴から、同一人物が写っている写真をグループ化してください。
服装や髪型が類似している人物を同一人物と判定してください。

${photoList}

必ず以下のJSON形式のみで回答してください（説明不要）:
{"groups":[{"label":"人物A (特徴)","photoIds":["id1","id2"]},{"label":"人物B (特徴)","photoIds":["id3"]}]}

注意:
- 1人の人物に対して1グループ
- 全ての写真IDを含めてください
- labelは日本語で人物の主な特徴を簡潔に`;

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
        max_tokens: 1000,
        messages: [
          { role: "user", content: groupPrompt },
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
        if (Array.isArray(parsed.groups)) {
          const groups = parsed.groups
            .filter((g: Record<string, unknown>) => g.label && Array.isArray(g.photoIds))
            .map((g: Record<string, unknown>, i: number) => ({
              id: `face-group-${i}`,
              label: String(g.label),
              photoIds: (g.photoIds as string[]).filter((id) => typeof id === "string"),
            }));
          return NextResponse.json({ groups });
        }
      } catch {
        // JSON parse failed
      }
    }

    return NextResponse.json({ groups: [] });
  } catch (err) {
    console.error("Face grouping error:", err);
    return NextResponse.json({ error: "Face grouping failed" }, { status: 500 });
  }
}
