/**
 * Cloudflare Workers AI REST API client
 * Model: @cf/openai/clip-vit-base-patch32 (image embedding, 512-dim)
 */

const CF_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";
const MODEL = "@cf/openai/clip-vit-base-patch32";

export function isCfAiConfigured(): boolean {
  return !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
}

/**
 * Generate image embedding via CF Workers AI CLIP.
 * @param imageData - base64 encoded image (with or without data URL prefix) or raw Buffer
 * @returns number[] 512-dim embedding vector
 */
export async function generateImageEmbedding(imageData: string | Buffer): Promise<number[]> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN environment variables are required");
  }

  // Convert to Uint8Array number array required by CLIP API
  let imageArray: number[];
  if (typeof imageData === "string") {
    // base64 string (with or without data URL prefix)
    const base64 = imageData.replace(/^data:image\/[^;]+;base64,/, "");
    imageArray = Array.from(Buffer.from(base64, "base64"));
  } else {
    imageArray = Array.from(imageData);
  }

  const url = `${CF_AI_BASE}/${accountId}/ai/run/${MODEL}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: imageArray }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`CF Workers AI CLIP error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result: { data: number[][] } | number[] | { label: string; score: number }[];
    errors?: { message: string }[];
  };

  if (!data.success) {
    const msg = data.errors?.[0]?.message ?? "CF Workers AI returned success=false";
    throw new Error(msg);
  }

  const result = data.result;
  if (!result) {
    throw new Error("Unexpected CF Workers AI response: empty result");
  }

  // CLIP returns { data: [[...512_floats]] }
  if (!Array.isArray(result) && typeof result === "object" && "data" in result) {
    const embData = (result as { data: number[][] }).data;
    if (Array.isArray(embData) && Array.isArray(embData[0])) {
      return embData[0];
    }
  }

  // Fallback: plain number array
  if (Array.isArray(result) && result.length > 0) {
    if (typeof result[0] === "number") return result as number[];
    // ResNet-50 style { label, score }[]
    if (typeof result[0] === "object" && result[0] !== null) {
      return (result as { label: string; score: number }[]).map((r) => r.score);
    }
  }

  throw new Error("Unexpected CF Workers AI CLIP response format");
}
