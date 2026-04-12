"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import QRCode from "qrcode";
import { jsPDF } from "jspdf";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { Company, EventData, EventStatus, EventTemplate, FrameTemplate } from "@/lib/types";
import {
  getStoredEvents, setStoredEvents, getStoredCompanies,
  getEventsForTenant, getStoredTenants,
  getStoredTemplates, setStoredTemplates, getTemplatesForTenant, getStoredFrameTemplates,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { logAudit } from "@/lib/audit";
import { inputCls, TIER_COLORS } from "./adminUtils";
import type { EditLock } from "@/lib/types";

type EventSortKey = "default" | "date-desc" | "date-asc" | "name-asc" | "name-desc" | "photos-desc";

interface Props {
  onSave: (msg: string) => void;
  tenantId?: string | null;
  acquireLock?: (recordType: string, recordId: string) => Promise<{ ok: boolean; lockedBy?: string }>;
  releaseLock?: (recordType: string, recordId: string) => Promise<void>;
  locks?: EditLock[];
  currentUserId?: string;
}

export default function EventsTab({ onSave, tenantId, acquireLock, releaseLock, locks, currentUserId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [frames, setFrames] = useState<FrameTemplate[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", date: "", venue: "", description: "", password: "", companyIds: [] as string[], frameTemplateId: "", slug: "", notifyEmail: "", status: "active" as EventStatus });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrEventId, setQrEventId] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  const [templates, setTemplatesState] = useState<EventTemplate[]>([]);
  const [templateNameInput, setTemplateNameInput] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  const [sortKey, setSortKey] = useState<EventSortKey>("default");
  const [filterText, setFilterText] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterStatus, setFilterStatus] = useState<EventStatus | "all">("all");

  const activeFrame = useMemo(
    () => frames.find((frame) => frame.isActive) ?? frames[0] ?? null,
    [frames],
  );

  const frameNameForEvent = (evt: EventData): string => {
    if (!evt.frameTemplateId) return activeFrame?.name || "既定フレーム";
    return frames.find((frame) => frame.id === evt.frameTemplateId)?.name || "既定フレーム";
  };

  const selectedFrame = useMemo(() => {
    if (form.frameTemplateId) {
      return frames.find((frame) => frame.id === form.frameTemplateId) || null;
    }
    return activeFrame;
  }, [activeFrame, form.frameTemplateId, frames]);

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
    setTemplatesState(tenantId ? getTemplatesForTenant(tenantId) : getStoredTemplates());
    setFrames(getStoredFrameTemplates());
  }, [tenantId]);

  const tenantInfo = tenantId ? getStoredTenants().find((t) => t.id === tenantId) : null;
  const maxEventsReached = tenantInfo?.maxEvents ? events.length >= tenantInfo.maxEvents : false;

  const startNew = () => {
    if (maxEventsReached) return;
    setEditing("__new__");
    setForm({ name: "", date: "", venue: "", description: "", password: "", companyIds: [], frameTemplateId: "", slug: "", notifyEmail: "", status: "active" });
  };

  const [lockWarning, setLockWarning] = useState<string | null>(null);

  const startEdit = async (evt: EventData) => {
    setLockWarning(null);
    if (acquireLock) {
      const result = await acquireLock("event", evt.id);
      if (!result.ok) {
        setLockWarning(`${result.lockedBy || "他のユーザー"}が編集中です`);
        return;
      }
    }
    setEditing(evt.id);
    setForm({
      name: evt.name,
      date: evt.date,
      venue: evt.venue || "",
      description: evt.description,
      password: evt.password,
      companyIds: evt.companyIds || [],
      frameTemplateId: evt.frameTemplateId || "",
      slug: evt.slug || "",
      notifyEmail: evt.notifyEmail || "",
      status: evt.status || "active",
    });
  };

  const cancelEdit = () => {
    if (editing && editing !== "__new__" && releaseLock) {
      releaseLock("event", editing);
    }
    setEditing(null);
    setLockWarning(null);
  };

  const getEventLock = (eventId: string): EditLock | undefined => {
    if (!locks || !currentUserId) return undefined;
    return locks.find((l) => l.recordType === "event" && l.recordId === eventId && l.lockedBy !== currentUserId);
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
        frameTemplateId: form.frameTemplateId || undefined,
        slug: slugVal,
        notifyEmail: emailVal,
        tenantId: tid,
        status: form.status,
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
              frameTemplateId: form.frameTemplateId || undefined,
              slug: slugVal,
              notifyEmail: emailVal,
              status: form.status,
            }
          : e
      );
    }
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    // Release lock on save
    if (editing && editing !== "__new__" && releaseLock) {
      releaseLock("event", editing);
    }
    setEditing(null);
    onSave("イベントを保存しました");
    if (editing === "__new__") {
      const created = updatedAll[updatedAll.length - 1];
      logAudit("event_create", { type: "event", id: created.id, name: created.name });
    } else {
      const updated = updatedAll.find((e) => e.id === editing);
      if (updated) logAudit("event_update", { type: "event", id: updated.id, name: updated.name });
    }
  };

  const remove = (id: string) => {
    const allEvents = getStoredEvents();
    const target = allEvents.find((e) => e.id === id);
    const updatedAll = allEvents.filter((e) => e.id !== id);
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave("イベントを削除しました");
    logAudit("event_delete", { type: "event", id, name: target?.name });
  };

  const cloneEvent = (evt: EventData) => {
    if (maxEventsReached) return;
    setEditing("__new__");
    setForm({
      name: `${evt.name} (コピー)`,
      date: "",
      venue: evt.venue || "",
      description: evt.description,
      password: "",
      companyIds: evt.companyIds || [],
      frameTemplateId: evt.frameTemplateId || "",
      slug: "",
      notifyEmail: evt.notifyEmail || "",
      status: "preparing",
    });
    onSave("イベントを複製しました。日付とパスワードを入力してください");
    logAudit("event_clone", { type: "event", id: evt.id, name: evt.name });
  };

  const saveAsTemplate = (evt: EventData) => {
    if (!templateName.trim()) return;
    const tmpl: EventTemplate = {
      id: `tmpl-${Date.now()}`,
      name: templateName.trim(),
      description: evt.description || undefined,
      venue: evt.venue || undefined,
      companyIds: evt.companyIds,
      surveyQuestions: evt.surveyQuestions,
      frameTemplateId: evt.frameTemplateId,
      tenantId: tenantId || undefined,
      createdAt: Date.now(),
    };
    const allTemplates = getStoredTemplates();
    const updated = [...allTemplates, tmpl];
    setStoredTemplates(updated);
    setTemplatesState(tenantId ? updated.filter((t) => t.tenantId === tenantId) : updated);
    setTemplateNameInput(null);
    setTemplateName("");
    onSave("テンプレートを保存しました");
    logAudit("event_create", { type: "template", id: tmpl.id, name: tmpl.name });
  };

  const createFromTemplate = (tmpl: EventTemplate) => {
    if (maxEventsReached) return;
    setEditing("__new__");
    setForm({
      name: tmpl.name,
      date: "",
      venue: tmpl.venue || "",
      description: tmpl.description || "",
      password: "",
      companyIds: tmpl.companyIds || [],
      frameTemplateId: tmpl.frameTemplateId || "",
      slug: "",
      notifyEmail: "",
      status: "preparing",
    });
    onSave("テンプレートを読み込みました。日付とパスワードを入力してください");
  };

  const removeTemplate = (id: string) => {
    const allTemplates = getStoredTemplates();
    const target = allTemplates.find((t) => t.id === id);
    const updated = allTemplates.filter((t) => t.id !== id);
    setStoredTemplates(updated);
    setTemplatesState(tenantId ? updated.filter((t) => t.tenantId === tenantId) : updated);
    onSave("テンプレートを削除しました");
    logAudit("event_delete", { type: "template", id, name: target?.name });
  };

  const filtered = events.filter((evt) => {
    if (filterStatus !== "all" && getEventStatus(evt) !== filterStatus) return false;
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

  const hasActiveFilters = !!(filterText || filterDateFrom || filterDateTo || filterStatus !== "all");

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

  const getEventStatus = (evt: EventData): EventStatus => {
    return evt.status || "active";
  };

  const STATUS_BADGE: Record<EventStatus, { label: string; cls: string }> = {
    preparing: { label: "準備中", cls: "bg-blue-50 text-blue-600 border-blue-200" },
    active: { label: "開催中", cls: "bg-green-50 text-green-600 border-green-200" },
    ended: { label: "終了", cls: "bg-yellow-50 text-yellow-600 border-yellow-200" },
    archived: { label: "アーカイブ", cls: "bg-gray-100 text-gray-500 border-gray-200" },
  };

  const STATUS_OPTIONS: { value: EventStatus | "all"; label: string }[] = [
    { value: "all", label: "すべて" },
    { value: "preparing", label: "準備中" },
    { value: "active", label: "開催中" },
    { value: "ended", label: "終了" },
    { value: "archived", label: "アーカイブ" },
  ];

  const extendExpiry = (evtId: string, days: number) => {
    const allEvents = getStoredEvents();
    const updatedAll = allEvents.map((e) => {
      if (e.id !== evtId) return e;
      const base = e.expiresAt && e.expiresAt > Date.now() ? e.expiresAt : Date.now();
      return { ...e, expiresAt: base + days * 86400000 };
    });
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave(`公開期限を${days}日延長しました`);
    logAudit("event_update", { type: "event", id: evtId }, { field: "expiry", days });
  };

  const setExpiryDate = (evtId: string, dateStr: string) => {
    if (!dateStr) return;
    const allEvents = getStoredEvents();
    const updatedAll = allEvents.map((e) => {
      if (e.id !== evtId) return e;
      const ts = new Date(dateStr + "T23:59:59").getTime();
      return { ...e, expiresAt: ts };
    });
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave("公開期限を設定しました");
    logAudit("event_update", { type: "event", id: evtId }, { field: "expiry", date: dateStr });
  };

  const archiveEvent = (evtId: string) => {
    const allEvents = getStoredEvents();
    const updatedAll = allEvents.map((e) =>
      e.id === evtId ? { ...e, status: "archived" as EventStatus, archivedAt: Date.now() } : e
    );
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    onSave("イベントをアーカイブしました");
    logAudit("event_update", { type: "event", id: evtId }, { field: "archive" });
  };

  return (
    <div className="space-y-4" data-testid="admin-events">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
        <div className="flex gap-2">
          <button
            onClick={generateBulkQrPdf}
            disabled={pdfGenerating || events.length === 0}
            aria-label={`QR一括PDF生成 (${events.length}件)`}
            className="text-xs px-3 py-1.5 rounded-lg bg-purple-500 text-white hover:bg-purple-600 font-medium disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
            data-testid="bulk-qr-pdf-btn"
          >
            {pdfGenerating ? "PDF生成中..." : `QR一括PDF (${events.length}件)`}
          </button>
          {!IS_DEMO_MODE && (
            <>
              {templates.length > 0 && (
                <select
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 focus:border-[#6EC6FF] focus:outline-none"
                  aria-label="テンプレートから作成"
                  value=""
                  onChange={(e) => {
                    const tmpl = templates.find((t) => t.id === e.target.value);
                    if (tmpl) createFromTemplate(tmpl);
                  }}
                  disabled={maxEventsReached}
                >
                  <option value="" disabled>テンプレートから作成</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
              <Button size="sm" onClick={startNew} disabled={maxEventsReached}>
                + 新規作成{maxEventsReached ? ` (上限${tenantInfo?.maxEvents}件)` : ""}
              </Button>
            </>
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

      {/* Status filter buttons */}
      <div className="flex gap-1.5 flex-wrap" data-testid="event-status-filter">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilterStatus(opt.value)}
            aria-label={`ステータス: ${opt.label}`}
            aria-pressed={filterStatus === opt.value}
            className={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              filterStatus === opt.value
                ? opt.value === "all" ? "bg-gray-800 text-white border-gray-800"
                  : opt.value === "preparing" ? "bg-blue-500 text-white border-blue-500"
                  : opt.value === "active" ? "bg-green-500 text-white border-green-500"
                  : opt.value === "ended" ? "bg-yellow-500 text-white border-yellow-500"
                  : "bg-gray-500 text-white border-gray-500"
                : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
            }`}
          >
            {opt.label}
            {opt.value !== "all" && (
              <span className="ml-1 opacity-75">
                {events.filter((e) => opt.value === "all" ? true : getEventStatus(e) === opt.value).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sort & Filter bar */}
      <Card>
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                className={inputCls + " pl-8"}
                placeholder="イベント名・会場・パスワードで検索"
                aria-label="イベント検索"
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
              aria-label="並び替え"
              className="px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600 bg-white focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
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
            <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} aria-label="開始日" className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600" data-testid="event-filter-date-from" />
            <span className="text-xs text-gray-400" aria-hidden="true">〜</span>
            <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} aria-label="終了日" className="px-2 py-1.5 rounded-lg border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-xs text-gray-600" data-testid="event-filter-date-to" />
            {hasActiveFilters && (
              <button onClick={() => { setFilterText(""); setFilterDateFrom(""); setFilterDateTo(""); setFilterStatus("all"); }} aria-label="フィルタをすべて解除" className="text-[10px] text-red-400 hover:text-red-600 ml-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">
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
            <input className={inputCls} placeholder="イベント名" aria-label="イベント名" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="event-name-input" />
            <input className={inputCls} type="date" aria-label="開催日" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="event-date-input" />
            <input className={inputCls} placeholder="会場（例: 東京ビッグサイト）" aria-label="会場" value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} data-testid="event-venue-input" />
            <input className={inputCls} placeholder="説明" aria-label="イベント説明" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />

            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 mb-2">フレーム設定</p>
              <p className="text-[10px] text-gray-400 mb-2">未選択の場合は「フレーム管理」で設定した使用フレームが適用されます</p>
              <select
                className={inputCls}
                aria-label="フレーム選択"
                value={form.frameTemplateId}
                onChange={(e) => setForm({ ...form, frameTemplateId: e.target.value })}
                data-testid="event-frame-select"
              >
                <option value="">既定フレーム（{activeFrame?.name || "未設定"}）</option>
                {frames.map((frame) => (
                  <option key={frame.id} value={frame.id}>
                    {frame.name}{frame.isActive ? "（現在の使用フレーム）" : ""}
                  </option>
                ))}
              </select>
              {selectedFrame ? (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-2">
                  <img src={selectedFrame.url} alt={selectedFrame.name} className="h-12 w-12 rounded-md object-contain bg-white" />
                  <div>
                    <p className="text-xs font-medium text-gray-600">{selectedFrame.name}</p>
                    <p className="text-[10px] text-gray-400">{form.frameTemplateId ? "イベント専用フレーム" : "既定フレーム"}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <input className={inputCls + " font-mono uppercase"} placeholder="パスワード（例: SUMMER2026）" aria-label="パスワード" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} data-testid="event-password-input" />
            <input className={inputCls + " font-mono"} placeholder="カスタムURL slug（例: summer2026 → /e/summer2026）" aria-label="カスタムURL slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} data-testid="event-slug-input" />
            <input className={inputCls} type="email" placeholder="通知メール（任意: admin@example.com）" aria-label="通知メールアドレス" value={form.notifyEmail} onChange={(e) => setForm({ ...form, notifyEmail: e.target.value })} data-testid="event-notify-email" />

            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 mb-2">ステータス</p>
              <select
                className={inputCls}
                aria-label="イベントステータス"
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as EventStatus })}
                data-testid="event-status-select"
              >
                <option value="preparing">準備中 (Preparing)</option>
                <option value="active">開催中 (Active)</option>
                <option value="ended">終了 (Ended)</option>
                <option value="archived">アーカイブ (Archived)</option>
              </select>
              <p className="text-[10px] text-gray-400 mt-1">
                {form.status === "preparing" && "ユーザーはアクセスできません"}
                {form.status === "active" && "ユーザーがアクセス・ダウンロード可能"}
                {form.status === "ended" && "ユーザーはURL経由でダウンロード可能"}
                {form.status === "archived" && "URLアクセス不可・ダウンロード不可"}
              </p>
            </div>

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
              <Button size="sm" variant="secondary" onClick={cancelEdit}>キャンセル</Button>
            </div>
          </div>
        </Card>
      )}

      {lockWarning && (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3 flex items-center gap-2" role="alert">
          <span>🔒</span>
          <p className="text-sm text-yellow-700 dark:text-yellow-400">{lockWarning}</p>
          <button onClick={() => setLockWarning(null)} className="ml-auto text-yellow-500 hover:text-yellow-700 text-sm">✕</button>
        </div>
      )}

      {sorted.length === 0 && hasActiveFilters && (
        <p className="text-sm text-gray-400 text-center py-8">条件に一致するイベントがありません</p>
      )}

      {sorted.map((evt) => (
        <Card key={evt.id}>
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-gray-700">{evt.name}</h3>
                {(() => {
                  const st = getEventStatus(evt);
                  const b = STATUS_BADGE[st];
                  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${b.cls}`}>{b.label}</span>;
                })()}
              </div>
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
              {!IS_DEMO_MODE && <button onClick={() => cloneEvent(evt)} aria-label={`${evt.name}をクローン`} className="text-xs text-purple-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 rounded">クローン</button>}
              {!IS_DEMO_MODE && <button onClick={() => { setTemplateNameInput(evt.id); setTemplateName(`${evt.name}テンプレート`); }} aria-label={`${evt.name}をテンプレート保存`} className="text-xs text-green-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 rounded">テンプレ保存</button>}
              {getEventLock(evt.id) && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400" title={`${getEventLock(evt.id)!.lockedByName}が編集中`}>
                  🔒 {getEventLock(evt.id)!.lockedByName}
                </span>
              )}
              {!IS_DEMO_MODE && <button onClick={() => startEdit(evt)} aria-label={`${evt.name}を編集`} className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">編集</button>}
              {!IS_DEMO_MODE && <button onClick={() => remove(evt.id)} aria-label={`${evt.name}を削除`} className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">削除</button>}
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

          <div className="mt-2 flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-400">フレーム:</span>
            <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full text-gray-600">
              {frameNameForEvent(evt)}
            </span>
            {evt.frameTemplateId ? (
              <span className="text-[10px] text-emerald-600">イベント指定</span>
            ) : (
              <span className="text-[10px] text-gray-400">既定</span>
            )}
          </div>

          {/* Template name inline dialog */}
          {templateNameInput === evt.id && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <input
                  className={inputCls + " flex-1"}
                  placeholder="テンプレート名"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") saveAsTemplate(evt); if (e.key === "Escape") setTemplateNameInput(null); }}
                />
                <Button size="sm" onClick={() => saveAsTemplate(evt)}>保存</Button>
                <Button size="sm" variant="secondary" onClick={() => setTemplateNameInput(null)}>取消</Button>
              </div>
            </div>
          )}

          {/* Publish period & status */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            {(() => {
              const st = getEventStatus(evt);
              const badge = STATUS_BADGE[st];
              return (
                <>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${badge.cls}`}>
                    {badge.label}
                  </span>
                  {evt.expiresAt && (
                    <span className="text-[10px] text-gray-400">
                      期限: {new Date(evt.expiresAt).toLocaleDateString("ja-JP")}
                    </span>
                  )}
                  {!IS_DEMO_MODE && st !== "archived" && (
                    <>
                      <button
                        onClick={() => extendExpiry(evt.id, 7)}
                        className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        aria-label={`${evt.name}の期限を7日延長`}
                      >
                        +7日
                      </button>
                      <input
                        type="date"
                        className="text-[10px] px-1.5 py-0.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF] text-gray-500"
                        aria-label={`${evt.name}の公開期限を設定`}
                        onChange={(e) => setExpiryDate(evt.id, e.target.value)}
                      />
                    </>
                  )}
                  {!IS_DEMO_MODE && st !== "archived" && (
                    <button
                      onClick={() => archiveEvent(evt.id)}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                      aria-label={`${evt.name}をアーカイブ`}
                    >
                      📦 アーカイブ
                    </button>
                  )}
                </>
              );
            })()}
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
                aria-label={`${evt.name}のURLをコピー`}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
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
                aria-label={qrEventId === evt.id ? `${evt.name}のQRコードを閉じる` : `${evt.name}のQRコードを表示`}
                aria-expanded={qrEventId === evt.id}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
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
                      aria-label={`${evt.name}のQRコードをダウンロード`}
                      className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
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

      {/* Template management section */}
      {!IS_DEMO_MODE && templates.length > 0 && (
        <div className="mt-6">
          <button
            onClick={() => setShowTemplates(!showTemplates)}
            className="flex items-center gap-2 text-sm font-bold text-gray-600 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
            aria-expanded={showTemplates}
          >
            <span className={`transform transition-transform ${showTemplates ? "rotate-90" : ""}`}>&#9654;</span>
            テンプレート一覧 ({templates.length}件)
          </button>
          <AnimatePresence>
            {showTemplates && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden mt-3 space-y-2"
              >
                {templates.map((tmpl) => (
                  <Card key={tmpl.id}>
                    <div className="flex justify-between items-center">
                      <div>
                        <h4 className="text-sm font-bold text-gray-700">{tmpl.name}</h4>
                        <p className="text-xs text-gray-400">
                          {tmpl.venue && `${tmpl.venue} · `}
                          {tmpl.description && `${tmpl.description} · `}
                          作成: {new Date(tmpl.createdAt).toLocaleDateString("ja-JP")}
                          {tmpl.companyIds && tmpl.companyIds.length > 0 && ` · CM企業${tmpl.companyIds.length}社`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => createFromTemplate(tmpl)}
                          disabled={maxEventsReached}
                          aria-label={`${tmpl.name}を使ってイベント作成`}
                          className="text-xs px-3 py-1.5 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                        >
                          使う
                        </button>
                        <button
                          onClick={() => removeTemplate(tmpl.id)}
                          aria-label={`${tmpl.name}テンプレートを削除`}
                          className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
