"use client";

import { useEffect, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { InvoiceData, InvoiceItem, Tenant } from "@/lib/types";
import {
  getStoredTenants, getStoredEvents, getStoredAnalytics,
  getStoredInvoices, setStoredInvoices,
  getEventsForTenant, getAnalyticsForTenant,
  getInvoicesForTenant,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

const STATUS_COLORS: Record<InvoiceData["status"], string> = {
  draft: "bg-gray-100 text-gray-600",
  issued: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
};

const PRICING = {
  eventBase: 50000,
  cmSlotPlatinum: 30000,
  cmSlotGold: 20000,
  cmSlotSilver: 10000,
  perParticipant: 100,
  photoStorage: 5000,
};

function formatYen(n: number): string {
  return `¥${n.toLocaleString()}`;
}

function generateInvoicePdf(invoice: InvoiceData, tenant: Tenant | undefined) {
  // Build an HTML invoice, render via jsPDF.html() which uses browser canvas
  // and natively supports Japanese text rendering.
  const itemRows = invoice.items.map((item) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;">${item.description}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatYen(item.unitPrice)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right;">${formatYen(item.amount)}</td>
    </tr>
  `).join("");

  const html = `
    <div style="font-family:'Hiragino Sans','Meiryo','Noto Sans JP',sans-serif;max-width:680px;margin:0 auto;padding:32px;color:#333;">
      <h1 style="text-align:center;font-size:28px;letter-spacing:4px;margin-bottom:24px;color:#222;">請求書</h1>
      <div style="display:flex;justify-content:space-between;margin-bottom:20px;">
        <div>
          <p style="font-size:11px;color:#888;margin:0;">請求書番号: ${invoice.id}</p>
          <p style="font-size:11px;color:#888;margin:2px 0;">ステータス: ${invoice.status === "draft" ? "下書き" : invoice.status === "issued" ? "発行済" : "支払済"}</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:11px;color:#888;margin:0;">発行日: ${invoice.issueDate}</p>
          <p style="font-size:11px;color:#888;margin:2px 0;">支払期限: ${invoice.dueDate}</p>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:24px;padding:12px;background:#f8f8fc;border-radius:8px;">
        <div>
          <p style="font-size:10px;color:#999;margin:0 0 4px;">差出人</p>
          <p style="font-size:12px;font-weight:bold;margin:0;">VLS System</p>
          <p style="font-size:11px;color:#666;margin:2px 0;">Event Photo Service</p>
        </div>
        <div style="text-align:right;">
          <p style="font-size:10px;color:#999;margin:0 0 4px;">請求先</p>
          <p style="font-size:12px;font-weight:bold;margin:0;">${tenant?.name || "N/A"}</p>
          <p style="font-size:11px;color:#666;margin:2px 0;">${tenant?.contactName || ""} ${tenant?.contactEmail ? `(${tenant.contactEmail})` : ""}</p>
          ${tenant?.billingAddress ? `<p style="font-size:11px;color:#666;margin:2px 0;">${tenant.billingAddress}</p>` : ""}
        </div>
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:16px;">
        <thead>
          <tr style="background:#f0f0f5;">
            <th style="padding:8px;text-align:left;">明細</th>
            <th style="padding:8px;text-align:center;width:60px;">数量</th>
            <th style="padding:8px;text-align:right;width:100px;">単価</th>
            <th style="padding:8px;text-align:right;width:100px;">金額</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:8px;">
        <p style="font-size:12px;color:#666;margin:4px 0;">小計: ${formatYen(invoice.subtotal)}</p>
        <p style="font-size:12px;color:#666;margin:4px 0;">消費税 (${invoice.taxRate}%): ${formatYen(invoice.taxAmount)}</p>
        <p style="font-size:18px;font-weight:bold;margin:8px 0;color:#222;">合計: ${formatYen(invoice.grandTotal)}</p>
      </div>
      ${invoice.notes ? `<div style="margin-top:16px;padding:8px 12px;background:#fffbe6;border-radius:6px;font-size:11px;color:#666;">備考: ${invoice.notes}</div>` : ""}
      <p style="text-align:center;font-size:9px;color:#bbb;margin-top:32px;">VLS System - Event Photo Service</p>
    </div>
  `;

  // Create offscreen container
  const container = document.createElement("div");
  container.style.position = "absolute";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.style.width = "210mm";
  container.innerHTML = html;
  document.body.appendChild(container);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.html(container, {
    callback: (pdf) => {
      document.body.removeChild(container);
      pdf.save(`Invoice_${invoice.id}.pdf`);
    },
    x: 0,
    y: 0,
    width: 210,
    windowWidth: 794, // A4 at 96 DPI
    html2canvas: { scale: 0.264 }, // mm to px ratio
  });
}

export default function InvoiceGenerator({ onSave, tenantId }: { onSave: (msg: string) => void; tenantId?: string | null }) {
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ tenantId: "", notes: "", taxRate: 10 });
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const descRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInvoices(tenantId ? getInvoicesForTenant(tenantId) : getStoredInvoices());
    setTenants(getStoredTenants());
  }, [tenantId]);

  const events = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
  const analytics = tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics();

  const startCreate = () => {
    setCreating(true);
    setForm({ tenantId: tenantId || "", notes: "", taxRate: 10 });
    setItems([]);
  };

  const addItem = (desc: string, qty: number, unitPrice: number) => {
    setItems([...items, { description: desc, quantity: qty, unitPrice, amount: qty * unitPrice }]);
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const autoGenerateItems = () => {
    if (!form.tenantId) return;
    const tenantEvents = events.filter((e) => e.tenantId === form.tenantId);
    const newItems: InvoiceItem[] = [];

    for (const evt of tenantEvents) {
      newItems.push({
        description: `Event fee: ${evt.name}`,
        quantity: 1,
        unitPrice: PRICING.eventBase,
        amount: PRICING.eventBase,
      });

      const evtAnalytics = analytics.filter((a) => a.eventId === evt.id);
      if (evtAnalytics.length > 0) {
        newItems.push({
          description: `Participants: ${evt.name} (${evtAnalytics.length} users)`,
          quantity: evtAnalytics.length,
          unitPrice: PRICING.perParticipant,
          amount: evtAnalytics.length * PRICING.perParticipant,
        });
      }

      if (evt.photos.length > 0) {
        newItems.push({
          description: `Photo storage: ${evt.name} (${evt.photos.length} photos)`,
          quantity: 1,
          unitPrice: PRICING.photoStorage,
          amount: PRICING.photoStorage,
        });
      }
    }

    setItems(newItems);
  };

  const saveInvoice = () => {
    if (!form.tenantId || items.length === 0) return;
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const taxAmount = Math.round(subtotal * form.taxRate / 100);
    const tenant = tenants.find((t) => t.id === form.tenantId);
    const prefix = tenant?.invoicePrefix || "INV";
    const tenantEvents = events.filter((e) => e.tenantId === form.tenantId);

    const invoice: InvoiceData = {
      id: `${prefix}-${Date.now().toString(36).toUpperCase()}`,
      tenantId: form.tenantId,
      eventIds: tenantEvents.map((e) => e.id),
      issueDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      items,
      subtotal,
      taxRate: form.taxRate,
      taxAmount,
      grandTotal: subtotal + taxAmount,
      status: "draft",
      notes: form.notes || undefined,
      createdAt: Date.now(),
    };

    // Merge with global store to avoid overwriting other tenants' data
    const allInvoices = getStoredInvoices();
    const updatedAll = [...allInvoices, invoice];
    setStoredInvoices(updatedAll);
    setInvoices(tenantId ? updatedAll.filter((i) => i.tenantId === tenantId) : updatedAll);
    setCreating(false);
    onSave("請求書を作成しました");
  };

  const downloadPdf = (invoice: InvoiceData) => {
    const tenant = tenants.find((t) => t.id === invoice.tenantId);
    generateInvoicePdf(invoice, tenant);
  };

  const updateStatus = (id: string, status: InvoiceData["status"]) => {
    const allInvoices = getStoredInvoices();
    const updatedAll = allInvoices.map((inv) => inv.id === id ? { ...inv, status } : inv);
    setStoredInvoices(updatedAll);
    setInvoices(tenantId ? updatedAll.filter((i) => i.tenantId === tenantId) : updatedAll);
    onSave(`ステータスを${status}に更新しました`);
  };

  const deleteInvoice = (id: string) => {
    const allInvoices = getStoredInvoices();
    const updatedAll = allInvoices.filter((inv) => inv.id !== id);
    setStoredInvoices(updatedAll);
    setInvoices(tenantId ? updatedAll.filter((i) => i.tenantId === tenantId) : updatedAll);
    onSave("請求書を削除しました");
  };

  const subtotal = items.reduce((s, i) => s + i.amount, 0);
  const taxAmount = Math.round(subtotal * form.taxRate / 100);
  const grandTotal = subtotal + taxAmount;

  return (
    <div className="space-y-4" data-testid="admin-invoices">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">請求書管理</h2>
        {!IS_DEMO_MODE && <Button size="sm" onClick={startCreate}>+ 新規請求書</Button>}
      </div>

      {creating && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">請求書作成</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 block mb-1">請求先テナント</label>
              {tenantId ? (
                <input className={inputCls} value={tenants.find((t) => t.id === tenantId)?.name || tenantId} disabled />
              ) : (
                <select className={inputCls} value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} data-testid="invoice-tenant-select">
                  <option value="">テナントを選択...</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name} ({t.plan})</option>
                  ))}
                </select>
              )}
            </div>

            {form.tenantId && (
              <button onClick={autoGenerateItems} className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 font-medium">
                イベント実績から自動計算
              </button>
            )}

            {items.length > 0 && (
              <div className="border rounded-lg overflow-auto touch-pan-x">
                <table className="w-full text-xs min-w-[400px]">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="p-2 text-left">項目</th>
                      <th className="p-2 text-center w-16">数量</th>
                      <th className="p-2 text-right w-24">単価</th>
                      <th className="p-2 text-right w-24">金額</th>
                      <th className="p-2 w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, i) => (
                      <tr key={i} className="border-b">
                        <td className="p-2">{item.description}</td>
                        <td className="p-2 text-center">{item.quantity}</td>
                        <td className="p-2 text-right font-mono">{formatYen(item.unitPrice)}</td>
                        <td className="p-2 text-right font-mono font-bold">{formatYen(item.amount)}</td>
                        <td className="p-2 text-center">
                          <button onClick={() => removeItem(i)} className="text-red-400 hover:text-red-600">×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 border-t">
                      <td colSpan={3} className="p-2 text-right font-bold text-gray-600">小計</td>
                      <td className="p-2 text-right font-mono font-bold">{formatYen(subtotal)}</td>
                      <td></td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td colSpan={3} className="p-2 text-right text-gray-500">消費税 ({form.taxRate}%)</td>
                      <td className="p-2 text-right font-mono">{formatYen(taxAmount)}</td>
                      <td></td>
                    </tr>
                    <tr className="bg-blue-50 border-t-2 border-blue-200">
                      <td colSpan={3} className="p-2 text-right font-bold text-blue-700">合計</td>
                      <td className="p-2 text-right font-mono font-bold text-blue-700">{formatYen(grandTotal)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {/* Manual item add */}
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400">項目名</label>
                <input ref={descRef} className={inputCls} placeholder="CM枠料金 etc." />
              </div>
              <div className="w-16">
                <label className="text-[10px] text-gray-400">数量</label>
                <input ref={qtyRef} className={inputCls} type="number" defaultValue={1} />
              </div>
              <div className="w-24">
                <label className="text-[10px] text-gray-400">単価(円)</label>
                <input ref={priceRef} className={inputCls} type="number" placeholder="10000" />
              </div>
              <button
                onClick={() => {
                  const desc = descRef.current?.value || "";
                  const qty = parseInt(qtyRef.current?.value || "1") || 1;
                  const price = parseInt(priceRef.current?.value || "0") || 0;
                  if (desc && price > 0) {
                    addItem(desc, qty, price);
                    if (descRef.current) descRef.current.value = "";
                    if (priceRef.current) priceRef.current.value = "";
                  }
                }}
                className="text-xs px-3 py-2 rounded-lg bg-gray-200 hover:bg-gray-300 font-medium whitespace-nowrap"
              >
                + 追加
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 block mb-1">税率 (%)</label>
                <input className={inputCls} type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1">備考</label>
                <input className={inputCls} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="お支払い期限: 発行日から30日以内" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={saveInvoice} disabled={items.length === 0 || !form.tenantId}>
                請求書を保存
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCreating(false)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Invoice list */}
      {invoices.length === 0 && !creating ? (
        <Card>
          <p className="text-sm text-gray-400 text-center py-6">請求書がありません</p>
        </Card>
      ) : (
        [...invoices].sort((a, b) => b.createdAt - a.createdAt).map((inv) => {
          const tenant = tenants.find((t) => t.id === inv.tenantId);
          return (
            <Card key={inv.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono font-bold text-gray-800 text-sm">{inv.id}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_COLORS[inv.status]}`}>
                      {inv.status === "draft" ? "下書き" : inv.status === "issued" ? "発行済" : "入金済"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {tenant?.name || inv.tenantId} | {inv.issueDate} | {inv.items.length}項目
                  </p>
                  <p className="text-lg font-bold text-gray-800 mt-1">{formatYen(inv.grandTotal)}</p>
                </div>
                <div className="flex gap-2 items-center">
                  {inv.status === "draft" && (
                    <button onClick={() => updateStatus(inv.id, "issued")} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 hover:bg-blue-200 font-medium">
                      発行
                    </button>
                  )}
                  {inv.status === "issued" && (
                    <button onClick={() => updateStatus(inv.id, "paid")} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200 font-medium">
                      入金済
                    </button>
                  )}
                  <button onClick={() => downloadPdf(inv)} className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium">
                    PDF
                  </button>
                  {!IS_DEMO_MODE && (
                    <button onClick={() => deleteInvoice(inv.id)} className="text-xs text-red-400 hover:text-red-600">
                      削除
                    </button>
                  )}
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
