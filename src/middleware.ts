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
];

/** API mutation methods requiring CSRF validation. */
const CSRF_METHODS = new Set(["POST", "PUT", "DELETE"]);

/** API routes exempt from CSRF (handled externally). */
const CSRF_EXEMPT = ["/api/auth/"];

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
];

function requiresAdminAuth(pathname: string, method: string): boolean {
  return ADMIN_API_RULES.some(
    (rule) => pathname.startsWith(rule.path) && rule.methods.includes(method)
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 0. Demo site: redirect / to /demo when hostname is vls-demo
  const host = request.headers.get("host") || "";
  if (pathname === "/" && host.startsWith("vls-demo")) {
    return NextResponse.redirect(new URL("/demo", request.url));
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
  ],
};
