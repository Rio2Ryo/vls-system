/**
 * Cloudflare Workers AI REST API client
 * Model: @cf/microsoft/resnet-50 (image classification / embedding)
 */

const CF_AI_BASE = "https://api.cloudflare.com/client/v4/accounts";
const MODEL = "@cf/microsoft/resnet-50";

export function isCfAiConfigured(): boolean {
  return !!(process.env.CF_ACCOUNT_ID && process.env.CF_API_TOKEN);
}

/**
 * Generate image embedding via CF Workers AI ResNet-50.
 * @param imageBase64 - base64 encoded image (with or without data URL prefix)
 * @returns number[] embedding vector
 */
export async function generateImageEmbedding(imageBase64: string): Promise<number[]> {
  const accountId = process.env.CF_ACCOUNT_ID;
  const apiToken = process.env.CF_API_TOKEN;

  if (!accountId || !apiToken) {
    throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN environment variables are required");
  }

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/[^;]+;base64,/, "");

  const url = `${CF_AI_BASE}/${accountId}/ai/run/${MODEL}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: base64Data }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "unknown error");
    throw new Error(`CF Workers AI error: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    result: { label: string; score: number }[] | number[];
    errors?: { message: string }[];
  };

  if (!data.success) {
    const msg = data.errors?.[0]?.message ?? "CF Workers AI returned success=false";
    throw new Error(msg);
  }

  const result = data.result;
  if (!result || !Array.isArray(result)) {
    throw new Error("Unexpected CF Workers AI response format: result is not an array");
  }

  // ResNet-50 returns [{ label, score }, ...]. Extract scores as embedding vector.
  if (result.length > 0 && typeof result[0] === "object" && result[0] !== null) {
    return (result as { label: string; score: number }[]).map((r) => r.score);
  }

  // If already a number array, return directly
  return result as number[];
}
