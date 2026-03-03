/**
 * fetch wrapper with retry (exponential backoff) + timeout.
 * Retries on network errors and HTTP 5xx only; 4xx responses are NOT retried.
 */

interface FetchRetryOptions {
  /** Number of retries after first attempt (default: 2 → total 3 attempts) */
  retries?: number;
  /** Request timeout in ms (default: 10000) */
  timeout?: number;
  /** Initial backoff delay in ms, doubles each retry (default: 1000) */
  backoff?: number;
}

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const { retries = 2, timeout = 10000, backoff = 1000 } = options ?? {};

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Don't retry 4xx — only retry 5xx
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        return res;
      }

      // 5xx — retry if attempts remain
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
    }

    // Wait before next retry (skip wait on last attempt)
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, backoff * 2 ** attempt));
    }
  }

  throw lastError;
}
