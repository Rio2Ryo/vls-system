"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Tenant } from "@/lib/types";
import {
  getStoredTenants, setStoredTenants,
  getStoredEvents, getStoredAnalytics,
  previewTenantCascade, deleteTenantCascade,
  TenantDeleteSummary,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { checkLicenseExpiry } from "@/lib/notify";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

const PLAN_LABELS: Record<Tenant["plan"], { label: string; color: string }> = {
  free: { label: "Free", color: "bg-gray-100 text-gray-600" },
  basic: { label: "Basic", color: "bg-blue-100 text-blue-700" },
  premium: { label: "Premium", color: "bg-purple-100 text-purple-700" },
  enterprise: { label: "Enterprise", color: "bg-yellow-100 text-yellow-700" },
};

export default function TenantManager({ onSave }: { onSave: (msg: string) => void }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", slug: "", adminPassword: "", plan: "basic" as Tenant["plan"],
    contactEmail: "", contactName: "", billingAddress: "", invoicePrefix: "",
    licenseStart: "", licenseEnd: "", maxEvents: "",
    logoUrl: "", primaryColor: "#6EC6FF",
  });
  const [expiryResult, setExpiryResult] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ tenantId: string; summary: TenantDeleteSummary } | null>(null);

  useEffect(() => { setTenants(getStoredTenants()); }, []);

  const events = getStoredEvents();
  const analytics = getStoredAnalytics();

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", slug: "", adminPassword: "", plan: "basic", contactEmail: "", contactName: "", billingAddress: "", invoicePrefix: "", licenseStart: "", licenseEnd: "", maxEvents: "", logoUrl: "", primaryColor: "#6EC6FF" });
  };

  const startEdit = (t: Tenant) => {
    setEditing(t.id);
    setForm({
      name: t.name, slug: t.slug, adminPassword: t.adminPassword, plan: t.plan,
      contactEmail: t.contactEmail, contactName: t.contactName,
      billingAddress: t.billingAddress || "", invoicePrefix: t.invoicePrefix || "",
      licenseStart: t.licenseStart || "", licenseEnd: t.licenseEnd || "",
      maxEvents: t.maxEvents != null ? String(t.maxEvents) : "",
      logoUrl: t.logoUrl || "", primaryColor: t.primaryColor || "#6EC6FF",
    });
  };

  const save = () => {
    if (!form.name || !form.slug || !form.adminPassword) return;
    const slugVal = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    let updated: Tenant[];
    const licenseFields = {
      licenseStart: form.licenseStart || undefined,
      licenseEnd: form.licenseEnd || undefined,
      maxEvents: form.maxEvents ? parseInt(form.maxEvents) : undefined,
      isActive: true,
    };
    if (editing === "__new__") {
      updated = [...tenants, {
        id: `tenant-${Date.now()}`,
        name: form.name,
        slug: slugVal,
        adminPassword: form.adminPassword.toUpperCase(),
        plan: form.plan,
        contactEmail: form.contactEmail,
        contactName: form.contactName,
        billingAddress: form.billingAddress || undefined,
        invoicePrefix: form.invoicePrefix || undefined,
        logoUrl: form.logoUrl || undefined,
        primaryColor: form.primaryColor || undefined,
        createdAt: Date.now(),
        ...licenseFields,
      }];
    } else {
      updated = tenants.map((t) =>
        t.id === editing ? {
          ...t,
          name: form.name,
          slug: slugVal,
          adminPassword: form.adminPassword.toUpperCase(),
          plan: form.plan,
          contactEmail: form.contactEmail,
          contactName: form.contactName,
          billingAddress: form.billingAddress || undefined,
          invoicePrefix: form.invoicePrefix || undefined,
          logoUrl: form.logoUrl || undefined,
          primaryColor: form.primaryColor || undefined,
          ...licenseFields,
        } : t
      );
    }
    setStoredTenants(updated);
    setTenants(updated);
    setEditing(null);
    onSave("テナントを保存しました");
  };

  const requestDelete = (id: string) => {
    const summary = previewTenantCascade(id);
    if (!summary) return;
    setDeleteConfirm({ tenantId: id, summary });
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    const result = deleteTenantCascade(deleteConfirm.tenantId);
    if (result) {
      setTenants(getStoredTenants());
      const total = result.events + result.participants + result.invoices
        + result.analytics + result.videoPlays + result.notifications;
      onSave(`「${result.tenantName}」と関連データ${total}件を削除しました`);
    }
    setDeleteConfirm(null);
  };

  return (
    <div className="space-y-4" data-testid="admin-tenants">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">テナント管理（マルチテナント）</h2>
        <div className="flex gap-2">
          <button
            onClick={() => {
              const expiring = checkLicenseExpiry(30);
              setExpiryResult(
                expiring.length > 0
                  ? `${expiring.length}件のライセンスが30日以内に期限切れ: ${expiring.map((t) => t.name).join(", ")}`
                  : "期限切れ間近のライセンスはありません"
              );
            }}
            className="text-xs px-3 py-1.5 rounded-lg bg-yellow-500 text-white hover:bg-yellow-600 font-medium"
          >
            期限チェック
          </button>
          {!IS_DEMO_MODE && <Button size="sm" onClick={startNew}>+ 新規テナント</Button>}
        </div>
      </div>

      {expiryResult && (
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-600">{expiryResult}</p>
            <button onClick={() => setExpiryResult(null)} className="text-xs text-gray-400 hover:text-gray-600">×</button>
          </div>
        </Card>
      )}

      <Card>
        <p className="text-xs text-gray-400">
          各テナント（学校・法人）は専用の管理パスワードでログインし、自分のイベントのみ表示されます。
          スーパー管理者（ADMIN_VLS_2026）は全テナントを管理できます。
        </p>
      </Card>

      {editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">
            {editing === "__new__" ? "新規テナント" : "テナント編集"}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">組織名 *</label>
              <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="さくら学園" data-testid="tenant-name-input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">スラッグ *</label>
              <input className={inputCls} value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="sakura" data-testid="tenant-slug-input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">管理パスワード *</label>
              <input className={inputCls} value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} placeholder="SAKURA_ADMIN_2026" data-testid="tenant-password-input" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">プラン</label>
              <select className={inputCls} value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as Tenant["plan"] })} data-testid="tenant-plan-select">
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="premium">Premium</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">担当者名</label>
              <input className={inputCls} value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} placeholder="田中 太郎" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">連絡先メール</label>
              <input className={inputCls} type="email" value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} placeholder="admin@example.com" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">請求先住所</label>
              <input className={inputCls} value={form.billingAddress} onChange={(e) => setForm({ ...form, billingAddress: e.target.value })} placeholder="東京都..." />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">請求書接頭辞</label>
              <input className={inputCls} value={form.invoicePrefix} onChange={(e) => setForm({ ...form, invoicePrefix: e.target.value })} placeholder="INV-SAKURA" />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ライセンス開始日</label>
              <input className={inputCls} type="date" value={form.licenseStart} onChange={(e) => setForm({ ...form, licenseStart: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">ライセンス終了日</label>
              <input className={inputCls} type="date" value={form.licenseEnd} onChange={(e) => setForm({ ...form, licenseEnd: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">上限イベント数</label>
              <input className={inputCls} type="number" value={form.maxEvents} onChange={(e) => setForm({ ...form, maxEvents: e.target.value })} placeholder="10" />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500 block mb-1">ロゴURL</label>
              <div className="flex items-center gap-3">
                <input className={inputCls} value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />
                {form.logoUrl && (
                  <img src={form.logoUrl} alt="logo preview" className="w-8 h-8 rounded-full object-cover border border-gray-200 flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">プライマリカラー</label>
              <div className="flex items-center gap-2">
                <input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} className="w-8 h-8 rounded cursor-pointer border-0 p-0" />
                <input className={inputCls} value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} placeholder="#6EC6FF" maxLength={7} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={save}>保存</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
          </div>
        </Card>
      )}

      {/* Cascade delete confirmation dialog */}
      {deleteConfirm && (
        <Card>
          <div className="border-l-4 border-red-400 pl-4">
            <h3 className="font-bold text-red-600 mb-2">テナント削除の確認</h3>
            <p className="text-sm text-gray-700 mb-3">
              「<b>{deleteConfirm.summary.tenantName}</b>」を削除すると、以下の関連データもすべて削除されます:
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {deleteConfirm.summary.events > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  イベント: <b>{deleteConfirm.summary.events}</b>件
                </div>
              )}
              {deleteConfirm.summary.participants > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  参加者: <b>{deleteConfirm.summary.participants}</b>件
                </div>
              )}
              {deleteConfirm.summary.invoices > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  請求書: <b>{deleteConfirm.summary.invoices}</b>件
                </div>
              )}
              {deleteConfirm.summary.analytics > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  分析記録: <b>{deleteConfirm.summary.analytics}</b>件
                </div>
              )}
              {deleteConfirm.summary.videoPlays > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  CM視聴: <b>{deleteConfirm.summary.videoPlays}</b>件
                </div>
              )}
              {deleteConfirm.summary.notifications > 0 && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1.5 rounded-lg">
                  通知ログ: <b>{deleteConfirm.summary.notifications}</b>件
                </div>
              )}
            </div>
            {deleteConfirm.summary.events === 0 && deleteConfirm.summary.participants === 0 && deleteConfirm.summary.invoices === 0 && (
              <p className="text-xs text-gray-400 mb-3">関連データはありません。</p>
            )}
            <p className="text-xs text-red-500 mb-3">この操作は取り消せません。</p>
            <div className="flex gap-2">
              <button
                onClick={confirmDelete}
                className="text-xs px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 font-medium"
              >
                削除する
              </button>
              <Button size="sm" variant="secondary" onClick={() => setDeleteConfirm(null)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {tenants.map((t) => {
        const tenantEvents = events.filter((e) => e.tenantId === t.id);
        const tenantAnalytics = analytics.filter((a) => tenantEvents.some((e) => e.id === a.eventId));
        const planInfo = PLAN_LABELS[t.plan];
        return (
          <Card key={t.id}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                {t.logoUrl && (
                  <img src={t.logoUrl} alt={t.name} className="w-10 h-10 rounded-full object-cover border border-gray-200 flex-shrink-0 mt-0.5" />
                )}
                {t.primaryColor && !t.logoUrl && (
                  <div className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: t.primaryColor }} />
                )}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-gray-800">{t.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${planInfo.color}`}>{planInfo.label}</span>
                </div>
                <p className="text-xs text-gray-400">
                  slug: {t.slug} | {t.contactName} ({t.contactEmail})
                </p>
                <p className="text-[10px] text-gray-300 font-mono mt-0.5">PW: {t.adminPassword}</p>
                <div className="flex gap-4 mt-2 text-xs">
                  <span className="text-blue-500">イベント: <b>{tenantEvents.length}</b>{t.maxEvents ? `/${t.maxEvents}` : ""}件</span>
                  <span className="text-green-500">アクセス: <b>{tenantAnalytics.length}</b>件</span>
                  <span className="text-purple-500">DL完了: <b>{tenantAnalytics.filter((a) => a.stepsCompleted.downloaded).length}</b>件</span>
                </div>
                {(t.licenseStart || t.licenseEnd) && (
                  <div className="flex gap-3 mt-1 text-[10px] text-gray-400">
                    {t.licenseStart && <span>開始: {t.licenseStart}</span>}
                    {t.licenseEnd && <span>終了: {t.licenseEnd}</span>}
                    {t.licenseEnd && (() => {
                      const daysLeft = Math.ceil((new Date(t.licenseEnd + "T23:59:59").getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                      if (daysLeft < 0) return <span className="text-red-500 font-bold">期限切れ</span>;
                      if (daysLeft <= 30) return <span className="text-yellow-600 font-bold">残{daysLeft}日</span>;
                      return <span className="text-green-500">有効</span>;
                    })()}
                  </div>
                )}
              </div>
              </div>
              {!IS_DEMO_MODE && (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(t)} className="text-xs text-blue-500 hover:underline">編集</button>
                  <button onClick={() => requestDelete(t.id)} className="text-xs text-red-400 hover:underline">削除</button>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      {tenants.length === 0 && (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">テナントが登録されていません</p>
        </Card>
      )}
    </div>
  );
}
