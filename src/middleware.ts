import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { ADMIN_PASSWORD } from "@/lib/constants";

const ADMIN_PAGES = [
  "/admin/events",
  "/admin/analytics",
  "/admin/stats",
  "/admin/users",
  "/admin/import",
  "/admin/checkin",
  "/admin/roi",
  "/admin/purchases",
  "/admin/push",
  "/admin/dashboard",
  "/admin/export",
  "/admin/scheduler",
  "/admin/segments",
  "/admin/calendar",
  "/admin/reports",
  "/admin/settings",
  "/admin/chat",
];

/** API mutation methods requiring CSRF validation. */
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE"]);

/** API routes exempt from CSRF (handled externally). */
const CSRF_EXEMPT = ["/api/auth/", "/api/webhook/stripe"];

/**
 * API routes + methods that require admin auth (session or x-admin-password).
 * Routes/methods not listed here are public.
 */
const ADMIN_API_RULES: { path: string; methods: string[] }[] = [
  { path: "/api/upload", methods: ["POST"] },
  { path: "/api/files", methods: ["GET", "DELETE"] },
  { path: "/api/lifecycle", methods: ["GET"] },
  { path: "/api/db", methods: ["PUT", "DELETE"] },
  { path: "/api/classify-photo", methods: ["POST"] },
  { path: "/api/digest", methods: ["GET", "POST"] },
];

function requiresAdminAuth(pathname: string, method: string): boolean {
  return ADMIN_API_RULES.some(
    (rule) => pathname.startsWith(rule.path) && rule.methods.includes(method)
  );
}

/* ─── Rate Limiting (in-memory sliding window) ─── */
interface RateLimitEntry {
  count: number;
  resetAt: number;
  lockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();
let lastRLCleanup = Date.now();

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function rlCleanup() {
  const now = Date.now();
  if (now - lastRLCleanup < 60_000) return;
  lastRLCleanup = now;
  rateLimitStore.forEach((entry, key) => {
    if (now > entry.resetAt && (!entry.lockedUntil || now > entry.lockedUntil)) {
      rateLimitStore.delete(key);
    }
  });
}

interface RLResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

function checkRateLimit(
  key: string,
  max: number,
  windowMs: number,
  lockoutMs?: number,
): RLResult {
  rlCleanup();
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (entry?.lockedUntil && now < entry.lockedUntil) {
    return { allowed: false, remaining: 0, resetAt: entry.lockedUntil };
  }

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  entry.count++;
  if (entry.count > max) {
    if (lockoutMs) entry.lockedUntil = now + lockoutMs;
    return { allowed: false, remaining: 0, resetAt: entry.lockedUntil || entry.resetAt };
  }

  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

const RL_TIERS = {
  login:      { max: 5,   windowMs: 60_000, lockoutMs: 60_000 },
  mutation:   { max: 30,  windowMs: 60_000 },
  publicPost: { max: 10,  windowMs: 60_000 },
  publicGet:  { max: 120, windowMs: 60_000 },
};

const PUBLIC_POST_ROUTES = [
  "/api/push-subscribe",
  "/api/nps",
  "/api/behavior",
  "/api/coupon",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Demo site: redirect / to /demo when hostname is vls-demo
  const host = request.headers.get("host") || "";
  if (pathname === "/" && host.startsWith("vls-demo")) {
    return NextResponse.redirect(new URL("/demo", request.url));
  }

  // 0.5 Rate limiting (API routes)
  let rlResult: RLResult | null = null;
  if (pathname.startsWith("/api/")) {
    const ip = getClientIp(request);
    if (pathname.startsWith("/api/auth/callback")) {
      rlResult = checkRateLimit(
        `login:${ip}`,
        RL_TIERS.login.max,
        RL_TIERS.login.windowMs,
        RL_TIERS.login.lockoutMs,
      );
    } else if (
      CSRF_METHODS.has(request.method) &&
      PUBLIC_POST_ROUTES.some((r) => pathname.startsWith(r))
    ) {
      rlResult = checkRateLimit(
        `pub-post:${ip}`,
        RL_TIERS.publicPost.max,
        RL_TIERS.publicPost.windowMs,
      );
    } else if (CSRF_METHODS.has(request.method)) {
      rlResult = checkRateLimit(
        `mutation:${ip}`,
        RL_TIERS.mutation.max,
        RL_TIERS.mutation.windowMs,
      );
    } else {
      rlResult = checkRateLimit(
        `get:${ip}`,
        RL_TIERS.publicGet.max,
        RL_TIERS.publicGet.windowMs,
      );
    }

    if (!rlResult.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rlResult.resetAt / 1000)),
            "Retry-After": String(
              Math.max(1, Math.ceil((rlResult.resetAt - Date.now()) / 1000)),
            ),
          },
        },
      );
    }
  }

  // 1. Auth check for admin sub-pages
  if (ADMIN_PAGES.some((p) => pathname.startsWith(p))) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (!token) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  // 2. Auth check for protected API routes (session JWT or x-admin-password header)
  if (pathname.startsWith("/api/") && requiresAdminAuth(pathname, request.method)) {
    const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    const adminPassword = request.headers.get("x-admin-password");
    if (!token && adminPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2.5 Viewer role restriction — viewers cannot use mutation APIs
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    CSRF_METHODS.has(request.method)
  ) {
    const viewerToken = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
    if (viewerToken?.role === "viewer") {
      return NextResponse.json(
        { error: "Forbidden: viewer role cannot perform write operations" },
        { status: 403 }
      );
    }
  }

  // 3. CSRF validation for mutation API routes
  if (
    pathname.startsWith("/api/") &&
    CSRF_METHODS.has(request.method) &&
    !CSRF_EXEMPT.some((p) => pathname.startsWith(p))
  ) {
    const cookieToken = request.cookies.get("csrf_token")?.value;
    const headerToken = request.headers.get("x-csrf-token");
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      return NextResponse.json(
        { error: "CSRF validation failed" },
        { status: 403 }
      );
    }
  }

  // 4. Set CSRF cookie if not present
  const response = NextResponse.next();
  if (!request.cookies.has("csrf_token")) {
    const token = crypto.randomUUID();
    response.cookies.set("csrf_token", token, {
      httpOnly: false, // Must be readable by client-side JS
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24, // 24 hours
    });
  }

  // 5. Set locale cookie if not present (i18n — Accept-Language detection)
  if (!request.cookies.has("locale")) {
    const acceptLang = request.headers.get("accept-language") || "";
    const locale = /^en/i.test(acceptLang) ? "en" : "ja";
    response.cookies.set("locale", locale, {
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // 6. Rate limit headers on successful response
  if (rlResult) {
    response.headers.set("X-RateLimit-Remaining", String(rlResult.remaining));
    response.headers.set(
      "X-RateLimit-Reset",
      String(Math.ceil(rlResult.resetAt / 1000)),
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/:path*",
    "/",
    "/survey",
    "/processing",
    "/photos",
    "/complete",
    "/downloading",
    "/e/:path*",
    "/demo",
    "/scan",
    "/album/:path*",
    "/my/:path*",
    "/sponsor",
    "/report/:path*",
  ],
};
