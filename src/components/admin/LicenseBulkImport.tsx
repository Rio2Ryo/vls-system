"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Tenant } from "@/lib/types";
import { getStoredTenants, setStoredTenants } from "@/lib/store";

interface ParsedLicenseRow {
  name: string;
  slug: string;
  password: string;
  plan: Tenant["plan"];
  email: string;
  contactName: string;
  licenseEnd: string;
  valid: boolean;
  error?: string;
}

const VALID_PLANS = new Set(["free", "basic", "premium", "enterprise"]);

function parseLicenseCSV(text: string): ParsedLicenseRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols: string[] = [];
    let current = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') {
        inQuote = !inQuote;
        continue;
      }
      if (ch === "," && !inQuote) {
        cols.push(current.trim());
        current = "";
        continue;
      }
      current += ch;
    }
    cols.push(current.trim());

    const name = cols[0] || "";
    const slug = (cols[1] || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const password = (cols[2] || "").toUpperCase();
    const plan = (cols[3] || "basic").toLowerCase() as Tenant["plan"];
    const email = cols[4] || "";
    const contactName = cols[5] || "";
    const licenseEnd = cols[6] || "";

    if (!name) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: "組織名が空" };
    if (!slug) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: "スラッグが空" };
    if (!password) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: "パスワードが空" };
    if (!VALID_PLANS.has(plan)) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: `不正なプラン: ${plan}` };
    if (email && !email.includes("@")) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: "メール形式不正" };
    if (licenseEnd && !/^\d{4}-\d{2}-\d{2}$/.test(licenseEnd)) return { name, slug, password, plan, email, contactName, licenseEnd, valid: false, error: "日付形式不正 (YYYY-MM-DD)" };
    return { name, slug, password, plan, email, contactName, licenseEnd, valid: true };
  });
}

export default function LicenseBulkImport({
  onSave,
}: {
  onSave: (msg: string) => void;
}) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [parsed, setParsed] = useState<ParsedLicenseRow[] | null>(null);

  useEffect(() => {
    setTenants(getStoredTenants());
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsed(parseLicenseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!parsed) return;
    const validRows = parsed.filter((r) => r.valid);
    if (validRows.length === 0) return;
    const existingSlugs = new Set(tenants.map((t) => t.slug));
    const today = new Date().toISOString().slice(0, 10);

    let imported = 0;
    let skipped = 0;
    const newTenants: Tenant[] = [];

    for (const row of validRows) {
      if (existingSlugs.has(row.slug)) {
        skipped++;
        continue;
      }
      existingSlugs.add(row.slug);
      newTenants.push({
        id: `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: row.name,
        slug: row.slug,
        adminPassword: row.password,
        plan: row.plan,
        contactEmail: row.email,
        contactName: row.contactName,
        createdAt: Date.now(),
        licenseStart: today,
        licenseEnd: row.licenseEnd || undefined,
        maxEvents: row.plan === "enterprise" ? 50 : row.plan === "premium" ? 10 : row.plan === "basic" ? 5 : 2,
        isActive: true,
      });
      imported++;
    }

    if (newTenants.length > 0) {
      const updated = [...tenants, ...newTenants];
      setStoredTenants(updated);
      setTenants(updated);
    }

    setParsed(null);
    const msg = skipped > 0
      ? `${imported}件のライセンスをインポート (${skipped}件スキップ: slug重複)`
      : `${imported}件のライセンスをインポートしました`;
    onSave(msg);
  };

  const exportTemplate = () => {
    const csv =
      "\uFEFF組織名,スラッグ,管理パスワード,プラン,メール,担当者名,ライセンス終了日\nテスト学園,test-school,TEST_ADMIN_2026,basic,admin@test.example.com,テスト太郎,2026-12-31\nサンプル幼稚園,sample-nursery,SAMPLE_ADMIN_2026,premium,info@sample.example.com,サンプル花子,2027-03-31\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "license_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // License status helper
  const getLicenseStatus = (t: Tenant) => {
    if (t.isActive === false) return { label: "無効", color: "bg-red-100 text-red-600" };
    if (!t.licenseEnd) return { label: "無期限", color: "bg-green-100 text-green-600" };
    const now = new Date();
    const end = new Date(t.licenseEnd + "T23:59:59");
    const daysLeft = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) return { label: "期限切れ", color: "bg-red-100 text-red-600" };
    if (daysLeft <= 30) return { label: `残${daysLeft}日`, color: "bg-yellow-100 text-yellow-700" };
    return { label: "有効", color: "bg-green-100 text-green-600" };
  };

  return (
    <div className="space-y-4" data-testid="admin-licenses">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">
          ライセンス一括登録
        </h2>
        <button
          onClick={exportTemplate}
          className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium"
        >
          CSVテンプレート
        </button>
      </div>

      {/* Import form */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-2">CSV一括インポート</h3>
        <p className="text-xs text-gray-400 mb-3">
          形式: 組織名, スラッグ, 管理パスワード, プラン(free/basic/premium/enterprise), メール, 担当者名, ライセンス終了日(YYYY-MM-DD)
        </p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="text-sm"
          data-testid="license-file-input"
        />

        {parsed && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-600">
                プレビュー: {parsed.filter((r) => r.valid).length}/
                {parsed.length} 件有効
              </p>
              {parsed.some((r) => !r.valid) && (
                <span className="text-xs text-red-400">
                  {parsed.filter((r) => !r.valid).length}件エラー
                </span>
              )}
            </div>
            <div className="max-h-48 overflow-auto border rounded-lg touch-pan-x">
              <table className="w-full text-xs min-w-[500px]">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-2 text-left">組織名</th>
                    <th className="p-2 text-left">スラッグ</th>
                    <th className="p-2 text-left">プラン</th>
                    <th className="p-2 text-left">メール</th>
                    <th className="p-2 text-left">ライセンス終了</th>
                    <th className="p-2 text-center">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr
                      key={i}
                      className={`border-b ${row.valid ? "" : "bg-red-50"}`}
                    >
                      <td className="p-2">{row.name || "—"}</td>
                      <td className="p-2 font-mono text-gray-500">
                        {row.slug || "—"}
                      </td>
                      <td className="p-2">{row.plan}</td>
                      <td className="p-2 text-gray-500">
                        {row.email || "—"}
                      </td>
                      <td className="p-2 text-gray-500">
                        {row.licenseEnd || "—"}
                      </td>
                      <td className="p-2 text-center">
                        {row.valid ? (
                          <span className="text-green-500 font-bold">OK</span>
                        ) : (
                          <span className="text-red-400" title={row.error}>
                            NG
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleImport}
                disabled={!parsed.some((r) => r.valid)}
              >
                {parsed.filter((r) => r.valid).length}件をインポート
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setParsed(null)}
              >
                キャンセル
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Existing license overview */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">
          ライセンス一覧 ({tenants.length}件)
        </h3>
        {tenants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">
            ライセンスが登録されていません
          </p>
        ) : (
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-xs min-w-[500px]" data-testid="license-table">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="p-2 text-left">組織名</th>
                  <th className="p-2 text-left">プラン</th>
                  <th className="p-2 text-center">上限イベント</th>
                  <th className="p-2 text-center">ライセンス開始</th>
                  <th className="p-2 text-center">ライセンス終了</th>
                  <th className="p-2 text-center">状態</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => {
                  const status = getLicenseStatus(t);
                  return (
                    <tr key={t.id} className="border-b border-gray-50">
                      <td className="p-2 font-medium text-gray-700">
                        {t.name}
                      </td>
                      <td className="p-2">
                        <span className="px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase font-bold text-[10px]">
                          {t.plan}
                        </span>
                      </td>
                      <td className="p-2 text-center font-mono">
                        {t.maxEvents ?? "—"}
                      </td>
                      <td className="p-2 text-center text-gray-500">
                        {t.licenseStart || "—"}
                      </td>
                      <td className="p-2 text-center text-gray-500">
                        {t.licenseEnd || "—"}
                      </td>
                      <td className="p-2 text-center">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${status.color}`}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
