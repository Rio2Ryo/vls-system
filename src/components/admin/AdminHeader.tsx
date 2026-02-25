"use client";

import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/admin", label: "Admin" },
  { href: "/admin/events", label: "イベント" },
  { href: "/admin/analytics", label: "アンケート" },
  { href: "/admin/stats", label: "CM統計" },
  { href: "/admin/users", label: "ユーザー" },
];

interface AdminHeaderProps {
  title: string;
  badge?: string;
  onLogout: () => void;
  actions?: React.ReactNode;
}

export default function AdminHeader({ title, badge, onLogout, actions }: AdminHeaderProps) {
  const pathname = usePathname();

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
          </div>
          <div className="flex items-center gap-2">
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
