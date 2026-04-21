import { AuthOptions, Account, Profile } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { ADMIN_PASSWORD, DEFAULT_ADMIN_USERS, TENANTS } from "@/lib/data";
import { isD1Configured, upsertUserAccount, d1Get } from "@/lib/d1";
import type { Tenant } from "@/lib/types";

/**
 * LINE Login OAuth 2.1 provider for NextAuth.
 * LINE does not have an official next-auth provider, so we define a custom one.
 */
function LINEProvider() {
  const clientId = process.env.LINE_CLIENT_ID || "";
  const clientSecret = process.env.LINE_CLIENT_SECRET || "";
  if (!clientId) return null;

  return {
    id: "line",
    name: "LINE",
    type: "oauth" as const,
    authorization: {
      url: "https://access.line.me/oauth2/v2.1/authorize",
      params: { scope: "profile openid email", bot_prompt: "normal" },
    },
    token: "https://api.line.me/oauth2/v2.1/token",
    userinfo: "https://api.line.me/v2/profile",
    clientId,
    clientSecret,
    profile(profile: Record<string, string>) {
      return {
        id: profile.userId,
        name: profile.displayName,
        image: profile.pictureUrl,
        email: profile.email || null,
        role: "user",
        tenantId: null,
        tenantName: null,
      };
    },
  };
}

/** Build the list of enabled OAuth providers (only those with env vars set). */
function buildSocialProviders() {
  const providers = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      })
    );
  }

  const lineProvider = LINEProvider();
  if (lineProvider) {
    providers.push(lineProvider);
  }

  if (process.env.APPLE_ID && process.env.APPLE_SECRET) {
    providers.push(
      AppleProvider({
        clientId: process.env.APPLE_ID,
        clientSecret: process.env.APPLE_SECRET,
      })
    );
  }

  return providers;
}

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Admin",
      credentials: { password: { type: "password" } },
      async authorize(credentials) {
        const pw = credentials?.password || "";
        // Super admin
        if (pw === ADMIN_PASSWORD) {
          return { id: "super-admin", name: "Super Admin", role: "super_admin", tenantId: null, tenantName: null };
        }

        // Load tenants from D1 (dynamic) + fallback to static defaults
        let allTenants: Tenant[] = [...TENANTS];
        if (isD1Configured()) {
          try {
            const d1Data = await d1Get("vls_admin_tenants");
            if (d1Data) {
              const d1Tenants: Tenant[] = JSON.parse(d1Data);
              // Merge: D1 tenants override defaults by ID
              const d1Ids = new Set(d1Tenants.map((t) => t.id));
              allTenants = [
                ...d1Tenants,
                ...TENANTS.filter((t) => !d1Ids.has(t.id)),
              ];
            }
          } catch {
            // fallback to static TENANTS
          }
        }

        // Tenant admin
        const tenant = allTenants.find((t) => t.adminPassword === pw || t.adminPassword === pw.toUpperCase());
        if (tenant) {
          if (tenant.isActive === false) return null;
          if (tenant.licenseEnd && new Date(tenant.licenseEnd + "T23:59:59") < new Date()) return null;
          return { id: tenant.id, name: tenant.name, role: "tenant_admin", tenantId: tenant.id, tenantName: tenant.name };
        }
        // RBAC: Check admin users (viewers and custom roles)
        const adminUser = DEFAULT_ADMIN_USERS.find((u) => u.password === pw && u.isActive);
        if (adminUser) {
          const userTenant = adminUser.tenantId ? allTenants.find((t) => t.id === adminUser.tenantId) : null;
          return {
            id: adminUser.id,
            name: adminUser.name,
            role: adminUser.role,
            tenantId: adminUser.tenantId || null,
            tenantName: userTenant?.name || null,
          };
        }
        return null;
      },
    }),
    ...buildSocialProviders(),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }: { user: { id?: string; name?: string | null; email?: string | null; image?: string | null }; account: Account | null; profile?: Profile }) {
      // Persist social login users to D1
      if (account && account.provider !== "credentials" && isD1Configured()) {
        try {
          await upsertUserAccount({
            provider: account.provider,
            providerId: account.providerAccountId || user.id || "",
            email: user.email,
            name: user.name,
            image: user.image,
          });
        } catch (err) {
          console.error("Failed to upsert user account:", err);
          // Don't block login on D1 errors
        }
      }
      return true;
    },
    jwt({ token, user, account }) {
      if (user) {
        token.role = (user as { role?: string }).role || "user";
        token.tenantId = (user as { tenantId?: string | null }).tenantId || null;
        token.tenantName = (user as { tenantName?: string | null }).tenantName || null;
      }
      if (account) {
        token.provider = account.provider;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string | null;
      session.user.tenantName = token.tenantName as string | null;
      (session.user as Record<string, unknown>).provider = token.provider as string | undefined;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
