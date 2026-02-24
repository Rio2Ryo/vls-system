import crypto from "crypto";

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";

export const BUCKET_NAME = "vls-media";

function baseUrl(key: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${CF_API_TOKEN}` };
}

export function isR2Configured(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_API_TOKEN);
}

/** Upload a file to R2. Accepts ArrayBuffer (from file.arrayBuffer()). */
export async function r2Put(
  key: string,
  body: ArrayBuffer,
  contentType: string
): Promise<void> {
  const res = await fetch(baseUrl(key), {
    method: "PUT",
    headers: {
      ...authHeaders(),
      "Content-Type": contentType,
    },
    body: body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 PUT failed (${res.status}): ${text}`);
  }
}

/** Fetch an object from R2. Returns { body, contentType } or null if not found. */
export async function r2Get(
  key: string
): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const res = await fetch(baseUrl(key), {
    method: "GET",
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 GET failed (${res.status}): ${text}`);
  }
  const body = await res.arrayBuffer();
  const contentType =
    res.headers.get("content-type") || "application/octet-stream";
  return { body, contentType };
}

// --- Presigned token utilities ---
const PRESIGN_TTL = 600; // 10 minutes

function signingSecret(): string {
  // Derive a signing key from CF_API_TOKEN so no extra env var needed
  return crypto.createHash("sha256").update(CF_API_TOKEN + ":presign").digest("hex");
}

export interface PresignPayload {
  key: string;
  contentType: string;
  exp: number; // unix epoch seconds
}

/** Create a presigned upload token. */
export function createPresignToken(key: string, contentType: string): string {
  const payload: PresignPayload = {
    key,
    contentType,
    exp: Math.floor(Date.now() / 1000) + PRESIGN_TTL,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto
    .createHmac("sha256", signingSecret())
    .update(data)
    .digest("base64url");
  return `${data}.${sig}`;
}

/** Verify a presigned token. Returns payload if valid, null otherwise. */
export function verifyPresignToken(token: string): PresignPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expected = crypto
    .createHmac("sha256", signingSecret())
    .update(data)
    .digest("base64url");
  if (sig !== expected) return null;
  try {
    const payload: PresignPayload = JSON.parse(
      Buffer.from(data, "base64url").toString()
    );
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- List & Delete ---

export interface R2Object {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
}

/** List objects in R2 with optional prefix. */
export async function r2List(
  prefix?: string,
  limit = 200
): Promise<{ objects: R2Object[]; prefixes: string[] }> {
  const base = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}`;
  const params = new URLSearchParams();
  if (prefix) params.set("prefix", prefix);
  params.set("per_page", String(limit));
  params.set("delimiter", "/");

  const res = await fetch(`${base}/objects?${params}`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 LIST failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  const objects: R2Object[] = (json.result || []).map(
    (o: Record<string, unknown>) => ({
      key: o.key as string,
      size: Number(o.size),
      lastModified: o.last_modified as string,
      contentType: (o.http_metadata as Record<string, string> | undefined)
        ?.contentType,
    })
  );
  const prefixes: string[] = json.result_info?.delimited || [];
  return { objects, prefixes };
}

/** Delete an object from R2. */
export async function r2Delete(key: string): Promise<boolean> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: authHeaders(),
  });
  return res.ok;
}
