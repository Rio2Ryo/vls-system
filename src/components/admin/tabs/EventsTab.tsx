"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Company, EventData } from "@/lib/types";
import {
  getStoredEvents, setStoredEvents, getStoredCompanies,
  getEventsForTenant, getStoredTenants,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { inputCls, TIER_COLORS } from "./adminUtils";

type EventSortKey = "default" | "date-desc" | "date-asc" | "name-asc" | "name-desc" | "photos-desc";

interface Props {
  onSave: (msg: string) => void;
  tenantId?: string | null;
}

export default function EventsTab({ onSave, tenantId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", venue: "", description: "", password: "", companyIds: [] as string[], slug: "", notifyEmail: "" });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const [sortKey, setSortKey] = useState<EventSortKey>("default");
  const [filterText, setFilterText] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const getShareUrl = (pw: string) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return `${base}/?pw=${encodeURIComponent(pw)}`;
  };

  const getEventUrl = (evt: EventData) => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    return evt.slug ? `${base}/e/${evt.slug}` : getShareUrl(evt.password);
  };

  const copyUrl = (evt: EventData) => {
    navigator.clipboard.writeText(getEventUrl(evt));
    setCopiedId(evt.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleQr = async (evt: EventData) => {
    if (qrEventId === evt.id) {
      setQrEventId(null);
      setQrDataUrl(null);
      return;
    }
    setQrEventId(evt.id);
    const url = getEventUrl(evt);
    try {
      const dataUrl = await QRCode.toDataURL(url, {
        width: 400,
        margin: 2,
        color: { dark: "#333333", light: "#ffffff" },
      });
      setQrDataUrl(dataUrl);
    } catch {
      setQrDataUrl(null);
    }
  };

  const downloadQr = (evtName: string) => {
    if (!qrDataUrl) return;
    const a = document.createElement("a");
    a.href = qrDataUrl;
    a.download = `QR_${evtName.replace(/\s+/g, "_")}.png`;
    a.click();
  };

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setCompanies(getStoredCompanies());
  }, [tenantId]);

  const tenantInfo = tenantId ? getStoredTenants().find((t) => t.id === tenantId) : null;
  const maxEventsReached = tenantInfo?.maxEvents ? events.length >= tenantInfo.maxEvents : false;

  const startNew = () => {
    if (maxEventsReached) return;
    setEditing("__new__");
    setForm({ name: "", date: "", venue: "", description: "", password: "", companyIds: [], slug: "", notifyEmail: "" });
  };

  const startEdit = (evt: EventData) => {
    setEditing(evt.id);
    setForm({ name: evt.name, date: evt.date, venue: evt.venue || "", description: evt.description, password: evt.password, companyIds: evt.companyIds || [], slug: evt.slug || "", notifyEmail: evt.notifyEmail || "" });
  };

  const toggleCompany = (companyId: string) => {
    setForm((prev) => ({
      ...prev,
      companyIds: prev.companyIds.includes(companyId)
        ? prev.companyIds.filter((id) => id !== companyId)
        : [...prev.companyIds, companyId],
    }));
  };

  const save = () => {
    if (!form.name || !form.password) return;
    const slugVal = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || undefined;
    const emailVal = form.notifyEmail.trim() || undefined;
    const allEvents = getStoredEvents();
    let updatedAll: EventData[];
    if (editing === "__new__") {
      const tid = tenantId || undefined;
      const newEvt: EventData = {
        id: `evt-${Date.now()}`,
        name: form.name,
        date: form.date,
        venue: form.venue || undefined,
        description: form.description,
        password: form.password.toUpperCase(),
        photos: [],
        companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
        slug: slugVal,
        notifyEmail: emailVal,
        tenantId: tid,
      };
      updatedAll = [...allEvents, newEvt];
    } else {
      updatedAll = allEvents.map((e) =>
        e.id === editing
          ? {
              ...e,
              name: form.name,
              date: form.date,
              venue: form.venue || undefined,
              description: form.description,
              password: form.password.toUpperCase(),
              companyIds: form.companyIds.length > 0 ? form.companyIds : undefined,
              slug: slugVal,
              notifyEmail: emailVal,
            }
          : e
      );
    }
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    setEditing(null);
    onSave("イベントを保存しました");
  };

  const remove = (id: string) => {
    const allEvents = getStoredEvents();
    const updatedAll = allEvents.filter((e) => e.id !== id);
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave("イベントを削除しました");
  };

  const filtered = events.filter((evt) => {
    if (filterText) {
      const q = filterText.toLowerCase();
      const match =
        evt.name.toLowerCase().includes(q) ||
        (evt.venue || "").toLowerCase().includes(q) ||
        evt.password.toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filterDateFrom && evt.date < filterDateFrom) return false;
    if (filterDateTo && evt.date > filterDateTo) return false;
    return true;
  });

  const sorted = sortKey === "default"
    ? filtered
    : [...filtered].sort((a, b) => {
        switch (sortKey) {
          case "date-desc": return (b.date || "").localeCompare(a.date || "");
          case "date-asc": return (a.date || "").localeCompare(b.date || "");
          case "name-asc": return a.name.localeCompare(b.name, "ja");
          case "name-desc": return b.name.localeCompare(a.name, "ja");
          case "photos-desc": return b.photos.length - a.photos.length;
          default: return 0;
        }
      });

  const hasActiveFilters = !!(filterText || filterDateFrom || filterDateTo);

  const [pdfGenerating, setPdfGenerating] = useState(false);

  const generateBulkQrPdf = async () => {
    if (events.length === 0) return;
    setPdfGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = 210;
      const margin = 15;
      const cols = 2;
      const qrSize = 60;
      const cellW = (pageW - margin * 2) / cols;
      const cellH = 90;
      let idx = 0;

      for (const evt of events) {
        const url = getEventUrl(evt);
        const dataUrl = await QRCode.toDataURL(url, { width: 400, margin: 1 });

        const col = idx % cols;
        const row = Math.floor((idx % (cols * 3)) / cols);

        if (idx > 0 && idx % (cols * 3) === 0) {
          doc.addPage();
        }

        const x = margin + col * cellW;
        const y = margin + row * cellH;

        doc.addImage(dataUrl, "PNG", x + (cellW - qrSize) / 2, y, qrSize, qrSize);

        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        const label = evt.name;
        doc.text(label, x + cellW / 2, y + qrSize + 5, { align: "center" });

        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(url, x + cellW / 2, y + qrSize + 10, { align: "center" });

        doc.setFontSize(8);
        doc.text(`PW: ${evt.password}`, x + cellW / 2, y + qrSize + 15, { align: "center" });

        idx++;
      }

      doc.save(`VLS_QR_codes_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF generation error:", err);
    }
    setPdfGenerating(false);
  };

  return (
    <div className="space-y-4" data-testid="admin-events">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
        <div className="flex gap-2">
          <button
            onClick={generateBulkQrPdf}
            disabled={pdfGenerating || events.length === 0}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 font-medium disabled:opacity-50 transition-colors"
            data-testid="bulk-qr-pdf-btn"
          >
            {pdfGenerating ? "PDF生成中..." : `QR一括PDF (${events.length}件)`}
          </button>
          {!IS_DEMO_MODE && (
            <Button size="sm" onClick={startNew} disabled={maxEventsReached}>
              + 新規作成{maxEventsReached ? ` (上限${tenantInfo?.maxEvents}件)` : ""}
            </Button>
          )}
        </div>
      </div>

      {maxEventsReached && (
        <Card>
          <p className="text-xs text-yellow-600 text-center">
            イベント上限（{tenantInfo?.maxEvents}件）に達しています。プランのアップグレードをご検討ください。
          </p>
        </Card>
      )}

      {/* Sort & Filter bar */}
      <Card>
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                className={inputCls + " pl-8"}
                placeholder="イベント名・会場・パスワードで検索"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                data-testid="event-filter-text"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                🔍
              </span>
            </div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as EventSortKey)}
              className="px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600 bg-white"
              data-testid="event-sort-select"
            >
              <option value="default">登録順</option>
              <option value="date-desc">日付: 新しい順</option>
              <option value="date-asc">日付: 古い順</option>
              <option value="name-asc">名前: A→Z</option>
              <option value="name-desc">名前: Z→A</option>
              <option value="photos-desc">写真: 多い順</option>
            </select>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-gray-500 flex-shrink-0">期間:</span>
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600" data-testid="event-filter-date-from" />
            <span className="text-xs text-gray-400">〜</span>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600" data-testid="event-filter-date-to" />
            {hasActiveFilters && (
              <button onClick={() => { setFilterText(""); setFilterDateFrom(""); setFilterDateTo(""); }} className="text-[10px] text-red-400 hover:text-red-600 ml-auto">
                フィルタ解除
              </button>
            )}
          </div>
          <p className="text-[10px] text-gray-400">
            {hasActiveFilters ? `${sorted.length}件 / ${events.length}件表示` : `${events.length}件のイベント`}
          </p>
        </div>
      </Card>

      {!IS_DEMO_MODE && editing && (
        <Card>
          <h3 className="font-bold text-gray-700 mb-3">{editing === "__new__" ? "新規イベント" : "イベント編集"}</h3>
          <div className="space-y-3">
            <input className={inputCls} placeholder="イベント名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="event-name-input" />
            <input className={inputCls} type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
            <input className={inputCls} placeholder="会場（例: 東京ビッグサイト）" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} data-testid="event-venue-input" />
            <input className={inputCls} placeholder="説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className={inputCls + " font-mono uppercase"} placeholder="パスワード（例: SUMMER2026）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="event-password-input" />
            <input className={inputCls + " font-mono"} placeholder="カスタムURL slug（例: summer2026 → /e/summer2026）" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} data-testid="event-slug-input" />
            <input className={inputCls} type="email" placeholder="通知メール（任意: admin@example.com）" value={form.notifyEmail} onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })} data-testid="event-notify-email" />

            <div className="border border-gray-100 rounded-xl p-3" data-testid="event-company-assign">
              <p className="text-xs font-bold text-gray-500 mb-2">CM企業の割り当て</p>
              <p className="text-[10px] text-gray-400 mb-2">未選択の場合は全企業のCMが配信されます</p>
              {companies.length === 0 ? (
                <p className="text-xs text-gray-400">企業が登録されていません</p>
              ) : (
                <div className="space-y-1.5">
                  {companies.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={form.companyIds.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="rounded border-gray-300 text-[#6EC6FF] focus:ring-[#6EC6FF]"
                        data-testid={`event-company-${c.id}`}
                      />
                      <span className="text-sm text-gray-600 group-hover:text-gray-800">{c.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                        {c.tier}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={save}>保存</Button>
              <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {sorted.length === 0 && hasActiveFilters && (
        <p className="text-sm text-gray-400 text-center py-8">条件に一致するイベントがありません</p>
      )}

      {sorted.map((evt) => (
        <Card key={evt.id}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-gray-700">{evt.name}</h3>
              <p className="text-sm text-gray-400">
                {evt.date}{evt.venue ? ` · ${evt.venue}` : ""}{evt.description ? ` · ${evt.description}` : ""}
              </p>
              <p className="text-xs text-gray-400 mt-1">
                パスワード: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono" data-testid={`event-pw-${evt.id}`}>{evt.password}</code>
                {evt.slug && <span className="ml-2 text-blue-500">slug: /e/{evt.slug}</span>}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                {evt.photos.length}枚
              </span>
              {!IS_DEMO_MODE && <button onClick={() => startEdit(evt)} className="text-xs text-[#6EC6FF] hover:underline">編集</button>}
              {!IS_DEMO_MODE && <button onClick={() => remove(evt.id)} className="text-xs text-red-400 hover:underline">削除</button>}
            </div>
          </div>

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">CM企業:</span>
            {(!evt.companyIds || evt.companyIds.length === 0) ? (
              <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-500">全企業</span>
            ) : (
              evt.companyIds.map((cId) => {
                const co = companies.find((c) => c.id === cId);
                return co ? (
                  <span key={cId} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TIER_COLORS[co.tier]}`}>
                    {co.name}
                  </span>
                ) : null;
              })
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-[10px] text-gray-400 mb-1">ユーザー向け共有URL</p>
            <div className="flex items-center gap-2">
              <code
                className="flex-1 text-xs bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-lg font-mono text-gray-600 truncate"
                data-testid={`event-url-${evt.id}`}
              >
                {evt.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/e/${evt.slug}` : getShareUrl(evt.password)}
              </code>
              <button
                onClick={() => copyUrl(evt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  copiedId === evt.id
                    ? "bg-green-50 text-green-600 border border-green-200"
                    : "bg-[#6EC6FF] text-white hover:bg-blue-400"
                }`}
                data-testid={`event-copy-url-${evt.id}`}
              >
                {copiedId === evt.id ? "Copied!" : "URLコピー"}
              </button>
              <button
                onClick={() => toggleQr(evt)}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                  qrEventId === evt.id
                    ? "bg-gray-200 text-gray-600"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
                data-testid={`event-qr-toggle-${evt.id}`}
              >
                {qrEventId === evt.id ? "QR閉じる" : "QRコード"}
              </button>
            </div>

            <AnimatePresence>
              {qrEventId === evt.id && qrDataUrl && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 flex flex-col items-center gap-3 p-4 bg-white border border-gray-200 rounded-xl" data-testid={`event-qr-${evt.id}`}>
                    <canvas ref={qrCanvasRef} className="hidden" />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrDataUrl}
                      alt={`QR Code for ${evt.name}`}
                      className="w-48 h-48"
                      data-testid={`event-qr-image-${evt.id}`}
                    />
                    <p className="text-[10px] text-gray-400 text-center">{getShareUrl(evt.password)}</p>
                    <button
                      onClick={() => downloadQr(evt.name)}
                      className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors"
                      data-testid={`event-qr-download-${evt.id}`}
                    >
                      QRコードをダウンロード
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </Card>
      ))}
    </div>
  );
}
