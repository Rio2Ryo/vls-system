/**
 * CSRF protection using the double-submit cookie pattern.
 *
 * - Middleware sets a `csrf_token` cookie on every response (readable by JS).
 * - Client-side code reads the cookie and includes it as `x-csrf-token` header.
 * - Server-side API routes validate that the header matches the cookie.
 */

/** Read the CSRF token from the browser cookie (client-side). */
export function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

/** Build headers object with CSRF token included (client-side). */
export function csrfHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    "x-csrf-token": getCsrfToken(),
  };
}
