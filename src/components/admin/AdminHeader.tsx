"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { getStoredTenants } from "@/lib/store";
import { Tenant } from "@/lib/types";

const NAV_ITEMS = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/events", label: "イベント" },
  { href: "/admin/analytics", label: "アンケート" },
  { href: "/admin/stats", label: "CM統計" },
  { href: "/admin/users", label: "ユーザー" },
  { href: "/admin/import", label: "インポート" },
];

interface AdminHeaderProps {
  title: string;
  badge?: string;
  onLogout: () => void;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, badge, onLogout, actions }: AdminHeaderProps) {
  const pathname = usePathname();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  useEffect(() => {
    const tid = sessionStorage.getItem("adminTenantId") || null;
    setCurrentTenantId(tid);
    setIsSuperAdmin(!tid && sessionStorage.getItem("adminAuthed") === "true");
    if (!tid) {
      setTenants(getStoredTenants());
    }
  }, []);

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
    <div className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-bold text-gray-800 text-sm sm:text-base">{title}</h1>
            {badge && (
              <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full hidden sm:inline">
                {badge}
              </span>
            )}
            {currentTenantId && currentTenantName && (
              <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full hidden sm:inline">
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
                className="text-xs px-2 py-1 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF] bg-white"
                title="テナント切り替え"
              >
                <option value="__super__">全テナント (Super)</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            )}
            {actions}
            <button
              onClick={onLogout}
              className="text-xs sm:text-sm text-gray-400 hover:text-gray-600 ml-2"
            >
              ログアウト
            </button>
          </div>
        </div>
        {/* Navigation */}
        <div className="flex gap-1 mt-2 overflow-x-auto pb-0.5 -mx-1 px-1">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? "bg-[#6EC6FF] text-white"
                    : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                }`}
              >
                {item.label}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
