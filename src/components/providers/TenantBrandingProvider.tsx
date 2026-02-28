"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getStoredTenants } from "@/lib/store";

const DEFAULT_PRIMARY = "#6EC6FF";

interface TenantBrandingContextValue {
  logoUrl: string | null;
  primaryColor: string;
}

const TenantBrandingContext = createContext<TenantBrandingContextValue>({
  logoUrl: null,
  primaryColor: DEFAULT_PRIMARY,
});

export function useTenantBranding() {
  return useContext(TenantBrandingContext);
}

export default function TenantBrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [branding, setBranding] = useState<TenantBrandingContextValue>({
    logoUrl: null,
    primaryColor: DEFAULT_PRIMARY,
  });

  useEffect(() => {
    // Determine active tenant: session tenantId or super admin context
    const tenantId =
      session?.user?.tenantId ||
      (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null);

    if (!tenantId) {
      // No tenant selected — use defaults
      document.documentElement.style.setProperty("--primary", DEFAULT_PRIMARY);
      setBranding({ logoUrl: null, primaryColor: DEFAULT_PRIMARY });
      return;
    }

    const tenants = getStoredTenants();
    const tenant = tenants.find((t) => t.id === tenantId);
    const color = tenant?.primaryColor || DEFAULT_PRIMARY;
    const logo = tenant?.logoUrl || null;

    document.documentElement.style.setProperty("--primary", color);
    setBranding({ logoUrl: logo, primaryColor: color });
  }, [session]);

  // Listen for tenant context changes (super admin switching tenants triggers reload,
  // but also handle storage events for cross-tab sync)
  useEffect(() => {
    const handleStorage = () => {
      const tenantId =
        session?.user?.tenantId ||
        (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null);

      if (!tenantId) {
        document.documentElement.style.setProperty("--primary", DEFAULT_PRIMARY);
        setBranding({ logoUrl: null, primaryColor: DEFAULT_PRIMARY });
        return;
      }

      const tenants = getStoredTenants();
      const tenant = tenants.find((t) => t.id === tenantId);
      const color = tenant?.primaryColor || DEFAULT_PRIMARY;
      const logo = tenant?.logoUrl || null;

      document.documentElement.style.setProperty("--primary", color);
      setBranding({ logoUrl: logo, primaryColor: color });
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [session]);

  return (
    <TenantBrandingContext.Provider value={branding}>
      {children}
    </TenantBrandingContext.Provider>
  );
}
