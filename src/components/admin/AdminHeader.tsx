"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { getStoredTenants } from "@/lib/store";
import { Tenant } from "@/lib/types";
import { useTenantBranding } from "@/components/providers/TenantBrandingProvider";
import { useDarkMode } from "@/components/providers/DarkModeProvider";

const NAV_ITEMS = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/events", label: "イベント" },
  { href: "/admin/analytics", label: "アンケート" },
  { href: "/admin/stats", label: "CM統計" },
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/import", label: "インポート" },
  { href: "/admin/checkin", label: "チェックイン" },
];

interface AdminHeaderProps {
  title: string;
  badge?: string;
  onLogout: () => void;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, badge, onLogout, actions }: AdminHeaderProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);

  const { logoUrl } = useTenantBranding();
  const { isDark, toggle: toggleDark } = useDarkMode();
  const isSuperAdmin = session?.user?.role === "super_admin";

  useEffect(() => {
    const tid = sessionStorage.getItem("adminTenantId") || null;
    setCurrentTenantId(tid);
    if (isSuperAdmin) {
      setTenants(getStoredTenants());
    }
  }, [isSuperAdmin]);

  const handleTenantSwitch = (tenantId: string) => {
    if (tenantId === "__super__") {
      sessionStorage.removeItem("adminTenantId");
      setCurrentTenantId(null);
    } else {
      sessionStorage.setItem("adminTenantId", tenantId);
      setCurrentTenantId(tenantId);
    }
    window.location.reload();
  };

  const currentTenantName = currentTenantId
    ? tenants.find((t) => t.id === currentTenantId)?.name
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt="tenant logo" className="w-7 h-7 rounded-full object-cover border border-gray-200 dark:border-gray-600" />
            )}
            <h1 className="font-bold text-gray-800 dark:text-gray-100 text-sm sm:text-base">{title}</h1>
            {badge && (
              <span className="text-xs bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-2 py-0.5 rounded-full hidden sm:inline">
                {badge}
              </span>
            )}
            {currentTenantId && currentTenantName && (
              <span className="text-xs bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full hidden sm:inline">
                {currentTenantName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Super admin tenant switcher */}
            {isSuperAdmin && tenants.length > 0 && (
              <select
                value={currentTenantId || "__super__"}
                onChange={(e) => handleTenantSwitch(e.target.value)}
                className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] bg-white dark:bg-gray-800 dark:text-gray-200"
                style={{ "--tw-ring-color": "var(--primary)" } as React.CSSProperties}
                title="テナント切り替え"
                aria-label="テナント切り替え"
              >
                <option value="__super__">全テナント (Super)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {actions}
            <button
              onClick={toggleDark}
              className="text-xs px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              title={isDark ? "ライトモードに切替" : "ダークモードに切替"}
              aria-label={isDark ? "ライトモードに切替" : "ダークモードに切替"}
            >
              {isDark ? "☀️" : "🌙"}
            </button>
            <button
              onClick={onLogout}
              aria-label="ログアウト"
              className="text-xs sm:text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 ml-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
            >
              ログアウト
            </button>
          </div>
        </div>
        {/* Navigation */}
        <nav aria-label="管理画面ナビゲーション">
          <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5 -mx-1 px-1">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    isActive
                      ? "text-white"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  style={isActive ? { backgroundColor: "var(--primary)" } : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
