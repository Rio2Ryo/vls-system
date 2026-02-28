import "next-auth";

declare module "next-auth" {
  interface User {
    role: string;
    tenantId: string | null;
    tenantName: string | null;
  }
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      tenantId: string | null;
      tenantName: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    tenantId?: string | null;
    tenantName?: string | null;
  }
}
