/**
 * Cloudflare D1 HTTP API client.
 * Used by API routes (server-side only) to read/write kv_store.
 */

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || "";
const CF_API_TOKEN = process.env.CF_API_TOKEN || "";
const D1_DATABASE_ID = process.env.D1_DATABASE_ID || "";

function queryUrl(): string {
  return `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
}

export function isD1Configured(): boolean {
  return Boolean(CF_ACCOUNT_ID && CF_API_TOKEN && D1_DATABASE_ID);
}

interface D1Result {
  results: Record<string, unknown>[];
  success: boolean;
}

interface D1Response {
  result: D1Result[];
  success: boolean;
  errors: unknown[];
}

/** Execute a raw SQL query against D1. */
export async function d1Query(
  sql: string,
  params?: unknown[]
): Promise<Record<string, unknown>[]> {
  const body: { sql: string; params?: unknown[] } = { sql };
  if (params && params.length > 0) body.params = params;

  const res = await fetch(queryUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as D1Response;
  if (!json.success || !json.result?.[0]?.success) {
    throw new Error(`D1 query error: ${JSON.stringify(json.errors)}`);
  }

  return json.result[0].results;
}

/** Get a single value by key from kv_store. Returns null if not found. */
export async function d1Get(key: string): Promise<string | null> {
  const rows = await d1Query(
    "SELECT value FROM kv_store WHERE key = ?",
    [key]
  );
  if (rows.length === 0) return null;
  return rows[0].value as string;
}

/** Get all key-value pairs from kv_store. */
export async function d1GetAll(): Promise<Record<string, string>> {
  const rows = await d1Query("SELECT key, value FROM kv_store");
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key as string] = row.value as string;
  }
  return result;
}

/** Upsert a key-value pair into kv_store. */
export async function d1Set(key: string, value: string): Promise<void> {
  await d1Query(
    "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, ?, unixepoch())",
    [key, value]
  );
}

/** Delete a key from kv_store (sets value to empty array for clear operations). */
export async function d1Delete(key: string): Promise<void> {
  await d1Query(
    "INSERT OR REPLACE INTO kv_store (key, value, updated_at) VALUES (?, '[]', unixepoch())",
    [key]
  );
}

// ─── error_logs table ─────────────────────────────────────────────

let _tableEnsured = false;

/** Create error_logs table if it does not exist (idempotent). */
export async function ensureErrorLogsTable(): Promise<void> {
  if (_tableEnsured || !isD1Configured()) return;
  await d1Query(`
    CREATE TABLE IF NOT EXISTS error_logs (
      id         TEXT PRIMARY KEY,
      timestamp  INTEGER NOT NULL,
      route      TEXT NOT NULL,
      error      TEXT NOT NULL,
      stack      TEXT,
      userId     TEXT,
      source     TEXT DEFAULT 'server',
      url        TEXT,
      userAgent  TEXT
    )
  `);
  _tableEnsured = true;
}

/** Insert a single error row. */
export async function insertErrorLog(row: {
  id: string;
  timestamp: number;
  route: string;
  error: string;
  stack?: string;
  userId?: string;
  source?: string;
  url?: string;
  userAgent?: string;
}): Promise<void> {
  await ensureErrorLogsTable();
  await d1Query(
    `INSERT INTO error_logs (id, timestamp, route, error, stack, userId, source, url, userAgent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.timestamp,
      row.route,
      row.error.slice(0, 1000),
      row.stack?.slice(0, 3000) ?? null,
      row.userId ?? null,
      row.source ?? "server",
      row.url?.slice(0, 500) ?? null,
      row.userAgent?.slice(0, 300) ?? null,
    ]
  );
}

/** Fetch recent error logs (newest first, up to limit). */
export async function getErrorLogs(limit = 200): Promise<Record<string, unknown>[]> {
  await ensureErrorLogsTable();
  return d1Query(
    "SELECT * FROM error_logs ORDER BY timestamp DESC LIMIT ?",
    [limit]
  );
}

/** Delete all rows from error_logs. */
export async function clearErrorLogs(): Promise<void> {
  await ensureErrorLogsTable();
  await d1Query("DELETE FROM error_logs");
}

/** Keep only the most recent N rows (prune old entries). */
export async function pruneErrorLogs(keep = 500): Promise<void> {
  await ensureErrorLogsTable();
  await d1Query(
    `DELETE FROM error_logs WHERE id NOT IN (
       SELECT id FROM error_logs ORDER BY timestamp DESC LIMIT ?
     )`,
    [keep]
  );
}
