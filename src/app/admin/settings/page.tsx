"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { getStoredTenants, setStoredTenants, getThemeConfig, setThemeConfig } from "@/lib/store";
import {
  ThemeConfig,
  ThemePresetName,
  THEME_PRESETS,
  DEFAULT_THEME_CONFIG,
  Tenant,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PRESET_META: Record<ThemePresetName, { label: string; description: string }> = {
  default:    { label: "デフォルト",   description: "VLS標準テーマ — 爽やかなブルー基調" },
  modern:     { label: "モダン",       description: "インディゴ × シアンのミニマルデザイン" },
  classic:    { label: "クラシック",   description: "ネイビー × ゴールドの上品なスタイル" },
  vivid:      { label: "ビビッド",     description: "パープル × オレンジの鮮やかな配色" },
  monochrome: { label: "モノクロ",     description: "グレースケールの落ち着いたトーン" },
};

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

// ---------------------------------------------------------------------------
// Preview Component — mini admin layout mock
// ---------------------------------------------------------------------------

function ThemePreview({ theme }: { theme: Omit<ThemeConfig, "tenantId"> }) {
  const r = `${theme.borderRadius}px`;
  const fs = `${theme.fontSize}px`;
  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-sm"
      style={{ fontSize: fs }}
    >
      {/* Mock header */}
      <div className="px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full" style={{ backgroundColor: theme.primaryColor }} />
          <span className="font-bold text-xs text-gray-800 dark:text-gray-100">管理画面</span>
        </div>
        <div className="flex gap-1">
          {["ダッシュボード", "イベント", "ユーザー"].map((label, i) => (
            <span
              key={label}
              className="px-2 py-0.5 text-[10px] font-medium"
              style={
                i === 0
                  ? { backgroundColor: theme.primaryColor, color: "#fff", borderRadius: r }
                  : { color: "#6B7280", borderRadius: r }
              }
            >
              {label}
            </span>
          ))}
        </div>
      </div>
      {/* Mock content */}
      <div className="p-3 grid grid-cols-3 gap-2">
        {[
          { label: "アクセス", val: "1,234", bg: theme.primaryColor },
          { label: "DL率", val: "67%", bg: theme.accentColor },
          { label: "CM視聴", val: "89%", bg: theme.primaryColor },
        ].map((kpi) => (
          <div
            key={kpi.label}
            className="text-center py-2 text-white"
            style={{ backgroundColor: kpi.bg, borderRadius: r, opacity: 0.9 }}
          >
            <div className="text-[10px] opacity-80">{kpi.label}</div>
            <div className="text-sm font-bold">{kpi.val}</div>
          </div>
        ))}
      </div>
      {/* Mock table */}
      <div className="px-3 pb-3">
        <div
          className="border border-gray-100 dark:border-gray-700 overflow-hidden"
          style={{ borderRadius: r }}
        >
          <div
            className="flex text-[10px] font-medium text-white px-2 py-1"
            style={{ backgroundColor: theme.primaryColor }}
          >
            <span className="flex-1">名前</span>
            <span className="w-16 text-center">状態</span>
          </div>
          {["田中太郎", "佐藤花子"].map((name) => (
            <div
              key={name}
              className="flex text-[10px] px-2 py-1 border-t border-gray-50 dark:border-gray-700 text-gray-600 dark:text-gray-300"
            >
              <span className="flex-1">{name}</span>
              <span
                className="w-16 text-center text-white text-[9px] px-1.5 py-0.5"
                style={{ backgroundColor: theme.accentColor, borderRadius: r }}
              >
                完了
              </span>
            </div>
          ))}
        </div>
      </div>
      {/* Mock buttons */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          className="text-[10px] px-3 py-1 text-white font-medium"
          style={{ backgroundColor: theme.primaryColor, borderRadius: r }}
        >
          保存
        </button>
        <button
          className="text-[10px] px-3 py-1 font-medium border"
          style={{
            borderColor: theme.accentColor,
            color: theme.accentColor,
            borderRadius: r,
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function AdminSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Auth state
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");

  // Theme state
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("");
  const [theme, setTheme] = useState<Omit<ThemeConfig, "tenantId">>(DEFAULT_THEME_CONFIG);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<"preset" | "custom" | "darkmode">("preset");

  // Determine tenant
  useEffect(() => {
    if (status === "loading") return;
    const tid =
      session?.user?.tenantId ||
      (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null);
    setTenantId(tid);

    if (tid) {
      const tenants = getStoredTenants();
      const t = tenants.find((x) => x.id === tid);
      if (t) setTenantName(t.name);
      setTheme(getThemeConfig(tid));
    }
  }, [session, status]);

  // Auth check
  useEffect(() => {
    if (status === "loading") return;
    if (session?.user) {
      setAuthed(true);
    } else {
      const stored = sessionStorage.getItem("adminAuthenticated");
      if (stored === "true") setAuthed(true);
    }
  }, [session, status]);

  const handleLogin = useCallback(() => {
    const tenants = getStoredTenants();
    const match = tenants.some(
      (t: Tenant) => t.adminPassword === pw
    );
    if (match || pw === "ADMIN2026") {
      setAuthed(true);
      sessionStorage.setItem("adminAuthenticated", "true");
    } else {
      setPwError("パスワードが正しくありません");
    }
  }, [pw]);

  const handleLogout = useCallback(() => {
    setAuthed(false);
    sessionStorage.removeItem("adminAuthenticated");
    router.push("/admin");
  }, [router]);

  // Update a single theme field
  const updateTheme = useCallback((patch: Partial<Omit<ThemeConfig, "tenantId">>) => {
    setTheme((prev) => ({ ...prev, ...patch }));
    setSaved(false);
  }, []);

  // Apply preset
  const applyPreset = useCallback((name: ThemePresetName) => {
    setTheme(THEME_PRESETS[name]);
    setSaved(false);
  }, []);

  // Save theme
  const handleSave = useCallback(() => {
    if (!tenantId) return;
    setThemeConfig({ tenantId, ...theme });

    // Also update tenant.primaryColor for backward compat
    const tenants = getStoredTenants();
    const updated = tenants.map((t) =>
      t.id === tenantId ? { ...t, primaryColor: theme.primaryColor } : t
    );
    setStoredTenants(updated);

    // Apply CSS vars immediately
    document.documentElement.style.setProperty("--primary", theme.primaryColor);
    document.documentElement.style.setProperty("--accent", theme.accentColor);
    document.documentElement.style.setProperty("--radius", `${theme.borderRadius}px`);
    document.documentElement.style.setProperty("--font-size-base", `${theme.fontSize}px`);

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [tenantId, theme]);

  // Reset to default
  const handleReset = useCallback(() => {
    applyPreset("default");
  }, [applyPreset]);

  // Has changes from saved state
  const hasChanges = useMemo(() => {
    if (!tenantId) return false;
    const current = getThemeConfig(tenantId);
    return (
      current.primaryColor !== theme.primaryColor ||
      current.accentColor !== theme.accentColor ||
      current.borderRadius !== theme.borderRadius ||
      current.fontSize !== theme.fontSize ||
      current.presetName !== theme.presetName
    );
  }, [tenantId, theme]);

  // --- Login Screen ---
  if (!authed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-sm w-full">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">管理画面ログイン</h1>
          <input
            className={inputCls}
            type="password"
            value={pw}
            onChange={(e) => { setPw(e.target.value); setPwError(""); }}
            onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            placeholder="管理パスワード"
            aria-label="管理パスワード"
          />
          {pwError && <p className="text-xs text-red-500 mt-1">{pwError}</p>}
          <Button size="sm" onClick={handleLogin} className="mt-3 w-full">ログイン</Button>
        </Card>
      </div>
    );
  }

  // --- No tenant selected ---
  if (!tenantId) {
    return (
      <div className="min-h-screen bg-[var(--bg)]">
        <AdminHeader title="テーマ設定" onLogout={handleLogout} />
        <div className="max-w-4xl mx-auto p-4 sm:p-6">
          <Card>
            <div className="text-center py-8">
              <p className="text-gray-500 dark:text-gray-400 text-sm">
                テナントを選択してください（ヘッダーのドロップダウンから選択）
              </p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // --- Main Theme Builder ---
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AdminHeader title="テーマ設定" badge={tenantName || undefined} onLogout={handleLogout} />

      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          {/* Section tabs */}
          <div className="flex gap-1 mb-6">
            {(["preset", "custom", "darkmode"] as const).map((s) => {
              const labels = { preset: "プリセット", custom: "カスタム", darkmode: "ダークモード" };
              return (
                <button
                  key={s}
                  onClick={() => setActiveSection(s)}
                  className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    activeSection === s
                      ? "text-white"
                      : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                  style={activeSection === s ? { backgroundColor: "var(--primary)" } : undefined}
                  aria-pressed={activeSection === s}
                >
                  {labels[s]}
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Controls */}
            <div className="space-y-4">
              {/* Preset Section */}
              {activeSection === "preset" && (
                <motion.div
                  key="preset"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-3"
                >
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">プリセットテーマ</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    5種類のプリセットから選択してください。選択後にカスタムタブで微調整できます。
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(Object.keys(THEME_PRESETS) as ThemePresetName[]).map((name) => {
                      const preset = THEME_PRESETS[name];
                      const meta = PRESET_META[name];
                      const isActive = theme.presetName === name;
                      return (
                        <button
                          key={name}
                          onClick={() => applyPreset(name)}
                          aria-pressed={isActive}
                          aria-label={`テーマ: ${meta.label}`}
                          className={`text-left p-3 rounded-xl border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                            isActive
                              ? "border-gray-800 dark:border-white shadow-md"
                              : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div
                              className="w-5 h-5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: preset.primaryColor }}
                            />
                            <div
                              className="w-5 h-5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: preset.accentColor }}
                            />
                            <span className="text-sm font-bold text-gray-800 dark:text-gray-100">
                              {meta.label}
                            </span>
                            {isActive && (
                              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400">
                                適用中
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">
                            {meta.description}
                          </p>
                          <div className="flex gap-1 mt-2">
                            <span
                              className="text-[9px] px-2 py-0.5 text-white"
                              style={{
                                backgroundColor: preset.primaryColor,
                                borderRadius: `${preset.borderRadius}px`,
                              }}
                            >
                              Primary
                            </span>
                            <span
                              className="text-[9px] px-2 py-0.5 text-white"
                              style={{
                                backgroundColor: preset.accentColor,
                                borderRadius: `${preset.borderRadius}px`,
                              }}
                            >
                              Accent
                            </span>
                            <span className="text-[9px] text-gray-400 dark:text-gray-500 ml-auto">
                              R:{preset.borderRadius}px F:{preset.fontSize}px
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Custom Section */}
              {activeSection === "custom" && (
                <motion.div
                  key="custom"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">カスタムテーマ</h2>

                  {/* Primary Color */}
                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">プライマリカラー</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.primaryColor}
                        onChange={(e) => updateTheme({ primaryColor: e.target.value, presetName: "default" as ThemePresetName })}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        aria-label="プライマリカラーピッカー"
                      />
                      <input
                        className={inputCls + " max-w-[140px]"}
                        value={theme.primaryColor}
                        onChange={(e) => updateTheme({ primaryColor: e.target.value })}
                        maxLength={7}
                        aria-label="プライマリカラーコード"
                      />
                      <div
                        className="h-8 flex-1 rounded-lg"
                        style={{ backgroundColor: theme.primaryColor }}
                      />
                    </div>
                  </Card>

                  {/* Accent Color */}
                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">アクセントカラー</h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.accentColor}
                        onChange={(e) => updateTheme({ accentColor: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        aria-label="アクセントカラーピッカー"
                      />
                      <input
                        className={inputCls + " max-w-[140px]"}
                        value={theme.accentColor}
                        onChange={(e) => updateTheme({ accentColor: e.target.value })}
                        maxLength={7}
                        aria-label="アクセントカラーコード"
                      />
                      <div
                        className="h-8 flex-1 rounded-lg"
                        style={{ backgroundColor: theme.accentColor }}
                      />
                    </div>
                  </Card>

                  {/* Border Radius */}
                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">
                      角丸 (Border Radius): {theme.borderRadius}px
                    </h3>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={1}
                      value={theme.borderRadius}
                      onChange={(e) => updateTheme({ borderRadius: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                      aria-label="角丸サイズ"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>0px (四角)</span>
                      <span>12px</span>
                      <span>24px (丸め)</span>
                    </div>
                  </Card>

                  {/* Font Size */}
                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">
                      フォントサイズ: {theme.fontSize}px
                    </h3>
                    <input
                      type="range"
                      min={12}
                      max={18}
                      step={1}
                      value={theme.fontSize}
                      onChange={(e) => updateTheme({ fontSize: Number(e.target.value) })}
                      className="w-full accent-blue-500"
                      aria-label="フォントサイズ"
                    />
                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                      <span>12px (コンパクト)</span>
                      <span>14px</span>
                      <span>18px (大きめ)</span>
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Dark Mode Section */}
              {activeSection === "darkmode" && (
                <motion.div
                  key="darkmode"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="space-y-4"
                >
                  <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ダークモードテーマ</h2>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    ダークモード時に別のカラーを使用できます。未設定の場合はライトモードと同じカラーが適用されます。
                  </p>

                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">
                      ダークモード プライマリカラー
                    </h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.darkPrimaryColor || theme.primaryColor}
                        onChange={(e) => updateTheme({ darkPrimaryColor: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        aria-label="ダークモード プライマリカラーピッカー"
                      />
                      <input
                        className={inputCls + " max-w-[140px]"}
                        value={theme.darkPrimaryColor || ""}
                        onChange={(e) => updateTheme({ darkPrimaryColor: e.target.value || undefined })}
                        placeholder={theme.primaryColor}
                        maxLength={7}
                        aria-label="ダークモード プライマリカラーコード"
                      />
                      <button
                        onClick={() => updateTheme({ darkPrimaryColor: undefined })}
                        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        リセット
                      </button>
                    </div>
                  </Card>

                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">
                      ダークモード アクセントカラー
                    </h3>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={theme.darkAccentColor || theme.accentColor}
                        onChange={(e) => updateTheme({ darkAccentColor: e.target.value })}
                        className="w-10 h-10 rounded cursor-pointer border-0 p-0"
                        aria-label="ダークモード アクセントカラーピッカー"
                      />
                      <input
                        className={inputCls + " max-w-[140px]"}
                        value={theme.darkAccentColor || ""}
                        onChange={(e) => updateTheme({ darkAccentColor: e.target.value || undefined })}
                        placeholder={theme.accentColor}
                        maxLength={7}
                        aria-label="ダークモード アクセントカラーコード"
                      />
                      <button
                        onClick={() => updateTheme({ darkAccentColor: undefined })}
                        className="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        リセット
                      </button>
                    </div>
                  </Card>

                  {/* Dark mode preview */}
                  <Card>
                    <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">ダークモード プレビュー</h3>
                    <div className="bg-gray-900 p-4 rounded-xl">
                      <ThemePreview
                        theme={{
                          ...theme,
                          primaryColor: theme.darkPrimaryColor || theme.primaryColor,
                          accentColor: theme.darkAccentColor || theme.accentColor,
                        }}
                      />
                    </div>
                  </Card>
                </motion.div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Button size="sm" onClick={handleSave}>
                  {saved ? "✓ 保存しました" : "テーマを保存"}
                </Button>
                {hasChanges && (
                  <span className="text-[10px] text-yellow-600 dark:text-yellow-400">
                    未保存の変更があります
                  </span>
                )}
                <button
                  onClick={handleReset}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                >
                  デフォルトに戻す
                </button>
              </div>
            </div>

            {/* Right: Live Preview */}
            <div className="space-y-4">
              <div className="sticky top-4">
                <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">リアルタイムプレビュー</h2>
                <ThemePreview theme={theme} />

                {/* Theme summary */}
                <Card className="mt-4">
                  <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">現在のテーマ</h3>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: theme.primaryColor }} />
                      <span className="text-gray-600 dark:text-gray-300">Primary: {theme.primaryColor}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded" style={{ backgroundColor: theme.accentColor }} />
                      <span className="text-gray-600 dark:text-gray-300">Accent: {theme.accentColor}</span>
                    </div>
                    <div className="text-gray-600 dark:text-gray-300">
                      角丸: {theme.borderRadius}px
                    </div>
                    <div className="text-gray-600 dark:text-gray-300">
                      フォント: {theme.fontSize}px
                    </div>
                    <div className="col-span-2 text-gray-400 dark:text-gray-500">
                      プリセット: {PRESET_META[theme.presetName].label}
                    </div>
                  </div>
                </Card>

                {/* CSS variable export */}
                <Card className="mt-4">
                  <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">CSS変数</h3>
                  <pre className="text-[10px] bg-gray-50 dark:bg-gray-800 p-3 rounded-lg overflow-x-auto text-gray-600 dark:text-gray-300 font-mono">
{`:root {
  --primary: ${theme.primaryColor};
  --accent: ${theme.accentColor};
  --radius: ${theme.borderRadius}px;
  --font-size-base: ${theme.fontSize}px;
}`}
                  </pre>
                </Card>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
