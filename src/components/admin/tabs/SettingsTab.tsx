"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredTenants, setStoredTenants } from "@/lib/store";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

const COLOR_PRESETS = [
  "#6EC6FF", "#FF6B6B", "#51CF66", "#FFD43B", "#845EF7",
  "#FF922B", "#20C997", "#F06595", "#339AF0", "#495057",
];

export default function SettingsTab({ onSave, tenantId }: { onSave: (msg: string) => void; tenantId?: string | null }) {
  const { data: session } = useSession();
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6EC6FF");
  const [tenantName, setTenantName] = useState("");

  const isSuperAdmin = session?.user?.role === "super_admin";
  const activeTenantId = tenantId || session?.user?.tenantId || null;

  useEffect(() => {
    if (!activeTenantId) return;
    const tenants = getStoredTenants();
    const tenant = tenants.find((t) => t.id === activeTenantId);
    if (tenant) {
      setLogoUrl(tenant.logoUrl || "");
      setPrimaryColor(tenant.primaryColor || "#6EC6FF");
      setTenantName(tenant.name);
    }
  }, [activeTenantId]);

  const handleSave = () => {
    if (!activeTenantId) return;
    const tenants = getStoredTenants();
    const updated = tenants.map((t) =>
      t.id === activeTenantId
        ? { ...t, logoUrl: logoUrl || undefined, primaryColor: primaryColor || undefined }
        : t
    );
    setStoredTenants(updated);

    // Apply immediately
    document.documentElement.style.setProperty("--primary", primaryColor || "#6EC6FF");

    onSave("ブランディング設定を保存しました");
  };

  if (!activeTenantId) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isSuperAdmin
              ? "テナントを選択してください（ヘッダーのドロップダウンから選択）"
              : "テナント情報が見つかりません"}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ブランディング設定</h2>
      {tenantName && (
        <p className="text-sm text-gray-500 dark:text-gray-400">テナント: {tenantName}</p>
      )}

      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">ロゴ</h3>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ロゴURL</label>
            <input
              className={inputCls}
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
          {logoUrl && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500 dark:text-gray-400">プレビュー:</span>
              <img
                src={logoUrl}
                alt="logo preview"
                className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">プライマリカラー</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="w-10 h-10 rounded cursor-pointer border-0 p-0"
            />
            <input
              className={inputCls + " max-w-[140px]"}
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder="#6EC6FF"
              maxLength={7}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">プリセット</label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_PRESETS.map((color) => (
                <button
                  key={color}
                  onClick={() => setPrimaryColor(color)}
                  className={`w-8 h-8 rounded-lg border-2 transition-transform ${
                    primaryColor === color ? "border-gray-800 dark:border-white scale-110" : "border-transparent"
                  }`}
                  style={{ backgroundColor: color }}
                  title={color}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">プレビュー</label>
            <div className="flex items-center gap-3">
              <span
                className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                style={{ backgroundColor: primaryColor }}
              >
                アクティブタブ
              </span>
              <span
                className="text-xs px-3 py-1.5 rounded-full font-medium text-white shadow-sm"
                style={{ backgroundColor: primaryColor }}
              >
                ボタン
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Button size="sm" onClick={handleSave}>保存</Button>
    </div>
  );
}
