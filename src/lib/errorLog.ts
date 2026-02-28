/**
 * Lightweight error logging — replaces Sentry.
 * Client: POST to /api/errors
 * Server: logError() → D1 error_logs table (direct INSERT)
 */

export interface ErrorLogEntry {
  id: string;
  timestamp: number;
  route: string;
  error: string;
  stack?: string;
  userId?: string;
  source: "client" | "server" | "edge";
  url?: string;
  userAgent?: string;
  /** @deprecated kept for backward compat with captureError() */
  context?: string;
  /** @deprecated alias for error */
  message?: string;
}

/**
 * Log an error from an API route catch block → D1 error_logs table.
 * Fire-and-forget; never throws.
 *
 * Usage:
 *   } catch (error) {
 *     logError({ route: "/api/upload", error, userId: "..." });
 *     return NextResponse.json({ error: "Upload failed" }, { status: 500 });
 *   }
 */
export function logError(params: {
  route: string;
  error: unknown;
  stack?: string;
  userId?: string;
  source?: "client" | "server" | "edge";
  url?: string;
  userAgent?: string;
}): void {
  const err =
    params.error instanceof Error ? params.error : new Error(String(params.error));

  console.error(`[VLS Error] ${params.route}:`, err);

  // Fire-and-forget D1 INSERT via dynamic import (avoids top-level import issues)
  (async () => {
    try {
      const { insertErrorLog, isD1Configured, pruneErrorLogs } = await import("./d1");
      if (!isD1Configured()) return;

      await insertErrorLog({
        id: `err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        route: params.route,
        error: err.message,
        stack: params.stack ?? err.stack,
        userId: params.userId,
        source: params.source ?? "server",
        url: params.url,
        userAgent: params.userAgent,
      });

      // Probabilistic pruning (1 in 20 writes) to keep table bounded
      if (Math.random() < 0.05) {
        await pruneErrorLogs(500);
      }
    } catch {
      // D1 persistence failed — console.error already captured above
    }
  })();
}

/**
 * Capture an error and persist it (client + server).
 * Called from error.tsx, global-error.tsx, or any catch block.
 */
export function captureError(
  error: unknown,
  context?: string
): void {
  const err = error instanceof Error ? error : new Error(String(error));

  // Always log to console
  console.error(`[VLS Error] ${context || ""}`, err);

  if (typeof window !== "undefined") {
    // Client-side: POST to /api/errors
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        route: context || window.location.pathname,
        error: err.message,
        stack: err.stack,
        source: "client",
        url: window.location.href,
        userAgent: navigator.userAgent,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } else {
    // Server-side: direct D1 insert
    logError({ route: context || "server", error: err, source: "server" });
  }
}
