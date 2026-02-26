"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Tenant } from "@/lib/types";
import {
  getStoredTenants, setStoredTenants,
  getStoredEvents, getStoredAnalytics,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";

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
  });

  useEffect(() => { setTenants(getStoredTenants()); }, []);

  const events = getStoredEvents();
  const analytics = getStoredAnalytics();

  const startNew = () => {
    setEditing("__new__");
    setForm({ name: "", slug: "", adminPassword: "", plan: "basic", contactEmail: "", contactName: "", billingAddress: "", invoicePrefix: "" });
  };

  const startEdit = (t: Tenant) => {
    setEditing(t.id);
    setForm({
      name: t.name, slug: t.slug, adminPassword: t.adminPassword, plan: t.plan,
      contactEmail: t.contactEmail, contactName: t.contactName,
      billingAddress: t.billingAddress || "", invoicePrefix: t.invoicePrefix || "",
    });
  };

  const save = () => {
    if (!form.name || !form.slug || !form.adminPassword) return;
    const slugVal = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    let updated: Tenant[];
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
        createdAt: Date.now(),
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
        } : t
      );
    }
    setStoredTenants(updated);
    setTenants(updated);
    setEditing(null);
    onSave("テナントを保存しました");
  };

  const remove = (id: string) => {
    const updated = tenants.filter((t) => t.id !== id);
    setStoredTenants(updated);
    setTenants(updated);
    onSave("テナントを削除しました");
  };

  return (
    <div className="space-y-4" data-testid="admin-tenants">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">テナント管理（マルチテナント）</h2>
        {!IS_DEMO_MODE && <Button size="sm" onClick={startNew}>+ 新規テナント</Button>}
      </div>

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
          </div>
          <div className="flex gap-2 mt-4">
            <Button size="sm" onClick={save}>保存</Button>
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
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
                  <span className="text-blue-500">イベント: <b>{tenantEvents.length}</b>件</span>
                  <span className="text-green-500">アクセス: <b>{tenantAnalytics.length}</b>件</span>
                  <span className="text-purple-500">DL完了: <b>{tenantAnalytics.filter((a) => a.stepsCompleted.downloaded).length}</b>件</span>
                </div>
              </div>
              {!IS_DEMO_MODE && (
                <div className="flex gap-2">
                  <button onClick={() => startEdit(t)} className="text-xs text-blue-500 hover:underline">編集</button>
                  <button onClick={() => remove(t.id)} className="text-xs text-red-400 hover:underline">削除</button>
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
