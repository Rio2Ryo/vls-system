import { AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { ADMIN_PASSWORD, DEFAULT_ADMIN_USERS, TENANTS } from "@/lib/data";

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
        // Tenant admin
        const tenant = TENANTS.find((t) => t.adminPassword === pw.toUpperCase());
        if (tenant) {
          if (tenant.isActive === false) return null;
          if (tenant.licenseEnd && new Date(tenant.licenseEnd + "T23:59:59") < new Date()) return null;
          return { id: tenant.id, name: tenant.name, role: "tenant_admin", tenantId: tenant.id, tenantName: tenant.name };
        }
        // RBAC: Check admin users (viewers and custom roles)
        const adminUser = DEFAULT_ADMIN_USERS.find((u) => u.password === pw && u.isActive);
        if (adminUser) {
          const userTenant = adminUser.tenantId ? TENANTS.find((t) => t.id === adminUser.tenantId) : null;
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
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  pages: { signIn: "/admin" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.tenantId = (user as { tenantId: string | null }).tenantId;
        token.tenantName = (user as { tenantName: string | null }).tenantName;
      }
      return token;
    },
    session({ session, token }) {
      session.user.role = token.role as string;
      session.user.tenantId = token.tenantId as string | null;
      session.user.tenantName = token.tenantName as string | null;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
