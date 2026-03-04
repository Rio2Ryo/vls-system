"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { getStoredTenants, getThemeConfig } from "@/lib/store";
import { DEFAULT_THEME_CONFIG, ThemeConfig } from "@/lib/types";

const DEFAULT_PRIMARY = "#6EC6FF";
const DEFAULT_ACCENT = "#FFB6C1";

interface TenantBrandingContextValue {
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  borderRadius: number;
  fontSize: number;
}

const TenantBrandingContext = createContext<TenantBrandingContextValue>({
  logoUrl: null,
  primaryColor: DEFAULT_PRIMARY,
  accentColor: DEFAULT_ACCENT,
  borderRadius: DEFAULT_THEME_CONFIG.borderRadius,
  fontSize: DEFAULT_THEME_CONFIG.fontSize,
});

export function useTenantBranding() {
  return useContext(TenantBrandingContext);
}

/** Apply theme CSS variables to document root */
function applyThemeVars(theme: Omit<ThemeConfig, "tenantId">) {
  const root = document.documentElement;
  root.style.setProperty("--primary", theme.primaryColor);
  root.style.setProperty("--accent", theme.accentColor);
  root.style.setProperty("--radius", `${theme.borderRadius}px`);
  root.style.setProperty("--font-size-base", `${theme.fontSize}px`);
  // Dark mode overrides applied via class
  if (theme.darkPrimaryColor) {
    root.style.setProperty("--dark-primary", theme.darkPrimaryColor);
  }
  if (theme.darkAccentColor) {
    root.style.setProperty("--dark-accent", theme.darkAccentColor);
  }
}

function resetThemeVars() {
  applyThemeVars({
    presetName: "default",
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    borderRadius: DEFAULT_THEME_CONFIG.borderRadius,
    fontSize: DEFAULT_THEME_CONFIG.fontSize,
  });
}

export default function TenantBrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [branding, setBranding] = useState<TenantBrandingContextValue>({
    logoUrl: null,
    primaryColor: DEFAULT_PRIMARY,
    accentColor: DEFAULT_ACCENT,
    borderRadius: DEFAULT_THEME_CONFIG.borderRadius,
    fontSize: DEFAULT_THEME_CONFIG.fontSize,
  });

  useEffect(() => {
    const tenantId =
      session?.user?.tenantId ||
      (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null);

    if (!tenantId) {
      resetThemeVars();
      setBranding({
        logoUrl: null,
        primaryColor: DEFAULT_PRIMARY,
        accentColor: DEFAULT_ACCENT,
        borderRadius: DEFAULT_THEME_CONFIG.borderRadius,
        fontSize: DEFAULT_THEME_CONFIG.fontSize,
      });
      return;
    }

    const tenants = getStoredTenants();
    const tenant = tenants.find((t) => t.id === tenantId);
    const theme = getThemeConfig(tenantId);
    const logo = tenant?.logoUrl || null;

    applyThemeVars(theme);
    setBranding({
      logoUrl: logo,
      primaryColor: theme.primaryColor,
      accentColor: theme.accentColor,
      borderRadius: theme.borderRadius,
      fontSize: theme.fontSize,
    });
  }, [session]);

  // Cross-tab sync
  useEffect(() => {
    const handleStorage = () => {
      const tenantId =
        session?.user?.tenantId ||
        (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null);

      if (!tenantId) {
        resetThemeVars();
        setBranding({
          logoUrl: null,
          primaryColor: DEFAULT_PRIMARY,
          accentColor: DEFAULT_ACCENT,
          borderRadius: DEFAULT_THEME_CONFIG.borderRadius,
          fontSize: DEFAULT_THEME_CONFIG.fontSize,
        });
        return;
      }

      const tenants = getStoredTenants();
      const tenant = tenants.find((t) => t.id === tenantId);
      const theme = getThemeConfig(tenantId);
      const logo = tenant?.logoUrl || null;

      applyThemeVars(theme);
      setBranding({
        logoUrl: logo,
        primaryColor: theme.primaryColor,
        accentColor: theme.accentColor,
        borderRadius: theme.borderRadius,
        fontSize: theme.fontSize,
      });
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
