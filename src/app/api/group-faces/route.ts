import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

interface PhotoFace {
  photoId: string;
  descriptions: string[];
}

export async function POST(req: NextRequest) {
  if (!GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
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

  // Build description list
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
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: groupPrompt }] }],
          generationConfig: { maxOutputTokens: 1000, temperature: 0.1 },
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
