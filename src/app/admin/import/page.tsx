"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents, setStoredEvents, getStoredParticipants, setStoredParticipants,
  getEventsForTenant, getParticipantsForTenant,
  getStoredCompanies, setStoredCompanies,
} from "@/lib/store";
import { EventData, Participant, InterestTag, Company, CompanyTier } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

// --- CSV parser with quoted field support ---
function parseCSVLine(line: string): string[] {
  const cols: string[] = [];
  let current = "";
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === "," && !inQuote) { cols.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  cols.push(current.trim());
  return cols;
}

// --- Participant CSV ---
interface ParsedParticipantRow {
  name: string;
  email: string;
  tags: string;
  valid: boolean;
  error?: string;
}

function parseParticipantCSV(text: string): ParsedParticipantRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const name = cols[0] || "";
    const email = cols[1] || "";
    const tags = cols[2] || "";
    if (!name) return { name, email, tags, valid: false, error: "名前が空です" };
    if (email && !email.includes("@")) return { name, email, tags, valid: false, error: "メール形式が不正" };
    return { name, email, tags, valid: true };
  });
}

// --- Event CSV ---
interface ParsedEventRow {
  name: string;
  date: string;
  venue: string;
  password: string;
  description: string;
  valid: boolean;
  error?: string;
}

function parseEventCSV(text: string): ParsedEventRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const name = cols[0] || "";
    const date = cols[1] || "";
    const venue = cols[2] || "";
    const password = cols[3] || "";
    const description = cols[4] || "";
    if (!name) return { name, date, venue, password, description, valid: false, error: "イベント名が空です" };
    if (!password) return { name, date, venue, password, description, valid: false, error: "パスワードが空です" };
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return { name, date, venue, password, description, valid: false, error: "日付はYYYY-MM-DD形式" };
    return { name, date, venue, password, description, valid: true };
  });
}

// --- Company CSV ---
const VALID_TIERS = ["platinum", "gold", "silver", "bronze"] as const;

interface ParsedCompanyRow {
  name: string;
  tier: string;
  tags: string;
  cm15: string;
  cm30: string;
  cm60: string;
  offerText: string;
  offerUrl: string;
  couponCode: string;
  valid: boolean;
  error?: string;
}

function parseCompanyCSV(text: string): ParsedCompanyRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    const cols = parseCSVLine(line);
    const name = cols[0] || "";
    const tier = cols[1] || "";
    const tags = cols[2] || "";
    const cm15 = cols[3] || "";
    const cm30 = cols[4] || "";
    const cm60 = cols[5] || "";
    const offerText = cols[6] || "";
    const offerUrl = cols[7] || "";
    const couponCode = cols[8] || "";
    const base = { name, tier, tags, cm15, cm30, cm60, offerText, offerUrl, couponCode };
    if (!name) return { ...base, valid: false, error: "企業名が空です" };
    if (!VALID_TIERS.includes(tier as CompanyTier))
      return { ...base, valid: false, error: "tierはplatinum/gold/silver/bronzeのいずれか" };
    if (!offerText) return { ...base, valid: false, error: "offerTextが空です" };
    return { ...base, valid: true };
  });
}

type ImportMode = "participants" | "events" | "companies";

export default function ImportPage() {
  const { data: session, status } = useSession();
  const [toast, setToast] = useState("");

  const [mode, setMode] = useState<ImportMode>("participants");
  const [events, setEvents] = useState<EventData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Participant import state
  const [selectedEventId, setSelectedEventId] = useState("");
  const [parsedParticipants, setParsedParticipants] = useState<ParsedParticipantRow[] | null>(null);

  // Event import state
  const [parsedEvents, setParsedEvents] = useState<ParsedEventRow[] | null>(null);

  // Company import state
  const [parsedCompanies, setParsedCompanies] = useState<ParsedCompanyRow[] | null>(null);
  const [companies, setLocalCompanies] = useState<Company[]>([]);

  const [filterEvent, setFilterEvent] = useState("all");

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const reload = useCallback(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setParticipants(tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants());
    setLocalCompanies(getStoredCompanies());
  }, [tenantId]);

  useEffect(() => { if (status === "authenticated") reload(); }, [status, reload]);

  // --- Participant file upload ---
  const handleParticipantFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setParsedParticipants(parseParticipantCSV(ev.target?.result as string));
    reader.readAsText(file);
  };

  const handleImportParticipants = () => {
    if (!parsedParticipants || !selectedEventId) return;
    const validRows = parsedParticipants.filter((r) => r.valid);
    if (validRows.length === 0) return;
    const tid = tenantId || undefined;
    const newParticipants: Participant[] = validRows.map((row) => ({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventId: selectedEventId,
      tenantId: tid,
      name: row.name,
      email: row.email || undefined,
      tags: row.tags ? row.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean) as InterestTag[] : undefined,
      registeredAt: Date.now(),
      checkedIn: false,
    }));
    const allParticipants = getStoredParticipants();
    const updatedAll = [...allParticipants, ...newParticipants];
    setStoredParticipants(updatedAll);
    setParticipants(tenantId ? updatedAll.filter((p) => p.tenantId === tenantId) : updatedAll);
    setParsedParticipants(null);
    showToast(`${newParticipants.length}名の参加者をインポートしました`);
  };

  // --- Event file upload ---
  const handleEventFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setParsedEvents(parseEventCSV(ev.target?.result as string));
    reader.readAsText(file);
  };

  const handleImportEvents = () => {
    if (!parsedEvents) return;
    const validRows = parsedEvents.filter((r) => r.valid);
    if (validRows.length === 0) return;
    const tid = tenantId || undefined;
    const newEvents: EventData[] = validRows.map((row) => ({
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: row.name,
      date: row.date || new Date().toISOString().slice(0, 10),
      venue: row.venue || undefined,
      password: row.password.toUpperCase(),
      description: row.description || "",
      photos: [],
      tenantId: tid,
    }));
    const allEvents = getStoredEvents();
    const updatedAll = [...allEvents, ...newEvents];
    setStoredEvents(updatedAll);
    setEvents(tenantId ? updatedAll.filter((e) => e.tenantId === tenantId) : updatedAll);
    setParsedEvents(null);
    showToast(`${newEvents.length}件のイベントをインポートしました`);
  };

  // --- Company file upload ---
  const handleCompanyFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setParsedCompanies(parseCompanyCSV(ev.target?.result as string));
    reader.readAsText(file);
  };

  const handleImportCompanies = () => {
    if (!parsedCompanies) return;
    const validRows = parsedCompanies.filter((r) => r.valid);
    if (validRows.length === 0) return;
    const newCompanies: Company[] = validRows.map((row) => ({
      id: `co-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: row.name,
      logoUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(row.name.slice(0, 2))}&background=6EC6FF&color=fff&size=80&rounded=true`,
      tier: row.tier as CompanyTier,
      tags: row.tags ? row.tags.split(";").map((t) => t.trim()).filter(Boolean) as InterestTag[] : [],
      videos: {
        cm15: row.cm15,
        cm30: row.cm30,
        cm60: row.cm60,
      },
      offerText: row.offerText,
      offerUrl: row.offerUrl,
      couponCode: row.couponCode || undefined,
    }));
    const allCompanies = getStoredCompanies();
    const updatedAll = [...allCompanies, ...newCompanies];
    setStoredCompanies(updatedAll);
    setLocalCompanies(updatedAll);
    setParsedCompanies(null);
    showToast(`${newCompanies.length}社の企業をインポートしました`);
  };

  // --- Delete handlers ---
  const handleDeleteParticipant = (id: string) => {
    const allP = getStoredParticipants();
    const updated = allP.filter((p) => p.id !== id);
    setStoredParticipants(updated);
    setParticipants(tenantId ? updated.filter((p) => p.tenantId === tenantId) : updated);
  };

  // --- Template exports ---
  const exportParticipantTemplate = () => {
    const csv = "\uFEFF名前,メールアドレス,タグ\n田中太郎,tanaka@example.com,education;sports\n佐藤花子,sato@example.com,technology;art\n山田一郎,yamada@example.com,food;travel\n";
    downloadCSV(csv, "participants_template.csv");
  };

  const exportEventTemplate = () => {
    const csv = "\uFEFFイベント名,日付,会場,パスワード,説明\n夏祭り2026,2026-07-20,中央公園,SUMMER2026,毎年恒例の夏祭りイベント\n運動会2026,2026-10-10,第一体育館,SPORTS2026,学校運動会\n";
    downloadCSV(csv, "events_template.csv");
  };

  const exportCompanyTemplate = () => {
    const csv = "\uFEFFname,tier,tags,cm15,cm30,cm60,offerText,offerUrl,couponCode\n" +
      "サンプル企業A,gold,education;sports,dQw4w9WgXcQ,dQw4w9WgXcQ,dQw4w9WgXcQ,特別割引10%OFF,https://example.com,SAMPLE10\n" +
      "サンプル企業B,silver,technology;art,,,,,https://example.com,\n";
    downloadCSV(csv, "companies_template.csv");
  };

  const exportParticipants = () => {
    const target = filterEvent === "all" ? participants : participants.filter((p) => p.eventId === filterEvent);
    if (target.length === 0) return;
    const header = "名前,メール,イベント,タグ,登録日,チェックイン";
    const rows = target.map((p) => {
      const evt = events.find((e) => e.id === p.eventId);
      return [p.name, p.email || "", evt?.name || p.eventId, p.tags?.join(";") || "",
        new Date(p.registeredAt).toLocaleDateString("ja"), p.checkedIn ? "Yes" : "No"].join(",");
    });
    downloadCSV("\uFEFF" + header + "\n" + rows.join("\n"), `participants_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const filteredParticipants = filterEvent === "all"
    ? participants
    : participants.filter((p) => p.eventId === filterEvent);

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">インポート画面を読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "CSVインポート (Demo)" : "CSVインポート"}
        badge={`${participants.length}名登録済`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white text-sm px-4 py-2 rounded-xl shadow-lg" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Mode selector */}
        <div className="flex gap-2" role="tablist" aria-label="インポートタイプ">
          <button
            role="tab"
            aria-selected={mode === "participants"}
            onClick={() => setMode("participants")}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              mode === "participants" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            }`}
          >
            参加者インポート
          </button>
          <button
            role="tab"
            aria-selected={mode === "events"}
            onClick={() => setMode("events")}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              mode === "events" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            }`}
          >
            イベントインポート
          </button>
          <button
            role="tab"
            aria-selected={mode === "companies"}
            onClick={() => setMode("companies")}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              mode === "companies" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 dark:hover:bg-gray-700"
            }`}
          >
            企業インポート
          </button>
        </div>

        {/* === Participant Import === */}
        {mode === "participants" && (
          <>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700 dark:text-gray-200">参加者CSVインポート</h3>
                <div className="flex gap-2">
                  <button onClick={exportParticipantTemplate} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium">
                    CSVテンプレート
                  </button>
                  {participants.length > 0 && (
                    <button onClick={exportParticipants} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium">
                      参加者CSV出力
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">CSV形式: 名前,メールアドレス,タグ (タグはセミコロン区切り)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">対象イベント</label>
                  <select className={inputCls} value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                    <option value="">イベントを選択...</option>
                    {events.map((evt) => (
                      <option key={evt.id} value={evt.id}>{evt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">CSVファイル</label>
                  <input type="file" accept=".csv" onChange={handleParticipantFile} className="text-sm" />
                </div>
              </div>

              {/* Preview table with error highlighting */}
              {parsedParticipants && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                      プレビュー: {parsedParticipants.filter((r) => r.valid).length}/{parsedParticipants.length} 件有効
                    </p>
                    {parsedParticipants.some((r) => !r.valid) && (
                      <span className="text-xs text-red-500 font-bold">
                        {parsedParticipants.filter((r) => !r.valid).length}件エラー
                      </span>
                    )}
                  </div>
                  <div className="max-h-60 overflow-auto border dark:border-gray-700 rounded-lg touch-pan-x">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0">
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">行</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">名前</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">メール</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">タグ</th>
                          <th className="p-2 text-center text-gray-500 dark:text-gray-400">状態</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">エラー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedParticipants.map((row, i) => (
                          <tr key={i} className={`border-b dark:border-gray-700 ${row.valid ? "hover:bg-gray-50 dark:hover:bg-gray-700" : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50"}`}>
                            <td className="p-2 text-gray-400 dark:text-gray-500">{i + 2}</td>
                            <td className={`p-2 ${row.valid ? "" : "text-red-600 font-bold"}`}>{row.name || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{row.email || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{row.tags || "—"}</td>
                            <td className="p-2 text-center">
                              {row.valid
                                ? <span className="text-green-500 font-bold">OK</span>
                                : <span className="text-red-500 font-bold">NG</span>}
                            </td>
                            <td className="p-2 text-red-400 text-[10px]">{row.error || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleImportParticipants}
                      disabled={!selectedEventId || !parsedParticipants.some((r) => r.valid)}>
                      {parsedParticipants.filter((r) => r.valid).length}名をインポート
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setParsedParticipants(null)}>キャンセル</Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Existing participants list */}
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700 dark:text-gray-200">登録済み参加者 ({participants.length}名)</h3>
                <select
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none"
                  value={filterEvent} onChange={(e) => setFilterEvent(e.target.value)}
                >
                  <option value="all">全イベント</option>
                  {events.map((evt) => (
                    <option key={evt.id} value={evt.id}>
                      {evt.name} ({participants.filter((p) => p.eventId === evt.id).length}名)
                    </option>
                  ))}
                </select>
              </div>

              {filteredParticipants.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">参加者がいません</p>
              ) : (
                <div className="max-h-80 overflow-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <th className="p-2 text-left">名前</th>
                        <th className="p-2 text-left">メール</th>
                        <th className="p-2 text-left">イベント</th>
                        <th className="p-2 text-center">タグ</th>
                        <th className="p-2 text-center">登録日</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredParticipants.map((p) => {
                        const evt = events.find((e) => e.id === p.eventId);
                        return (
                          <tr key={p.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                            <td className="p-2 font-medium">{p.name}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{p.email || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{evt?.name || p.eventId}</td>
                            <td className="p-2 text-center">
                              {p.tags?.length
                                ? <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 px-1 rounded">{p.tags.length}</span>
                                : "—"}
                            </td>
                            <td className="p-2 text-gray-400 dark:text-gray-500 text-center">{new Date(p.registeredAt).toLocaleDateString("ja")}</td>
                            <td className="p-2 text-center">
                              <button onClick={() => handleDeleteParticipant(p.id)} aria-label={`${p.name}を削除`} className="text-red-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded">x</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}

        {/* === Event Import === */}
        {mode === "events" && (
          <Card>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-700 dark:text-gray-200">イベントCSVインポート</h3>
              <button onClick={exportEventTemplate} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium">
                CSVテンプレート
              </button>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">CSV形式: イベント名,日付(YYYY-MM-DD),会場,パスワード,説明</p>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">CSVファイル</label>
              <input type="file" accept=".csv" onChange={handleEventFile} className="text-sm" />
            </div>

            {/* Preview table */}
            {parsedEvents && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                    プレビュー: {parsedEvents.filter((r) => r.valid).length}/{parsedEvents.length} 件有効
                  </p>
                  {parsedEvents.some((r) => !r.valid) && (
                    <span className="text-xs text-red-500 font-bold">
                      {parsedEvents.filter((r) => !r.valid).length}件エラー
                    </span>
                  )}
                </div>
                <div className="max-h-60 overflow-auto border dark:border-gray-700 rounded-lg touch-pan-x">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0">
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">行</th>
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">名前</th>
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">日付</th>
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">会場</th>
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">パスワード</th>
                        <th className="p-2 text-center text-gray-500 dark:text-gray-400">状態</th>
                        <th className="p-2 text-left text-gray-500 dark:text-gray-400">エラー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedEvents.map((row, i) => (
                        <tr key={i} className={`border-b dark:border-gray-700 ${row.valid ? "hover:bg-gray-50 dark:hover:bg-gray-700" : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50"}`}>
                          <td className="p-2 text-gray-400 dark:text-gray-500">{i + 2}</td>
                          <td className={`p-2 ${row.valid ? "" : "text-red-600 font-bold"}`}>{row.name || "—"}</td>
                          <td className="p-2 text-gray-500 dark:text-gray-400">{row.date || "—"}</td>
                          <td className="p-2 text-gray-500 dark:text-gray-400">{row.venue || "—"}</td>
                          <td className="p-2 text-gray-500 dark:text-gray-400 font-mono">{row.password || "—"}</td>
                          <td className="p-2 text-center">
                            {row.valid
                              ? <span className="text-green-500 font-bold">OK</span>
                              : <span className="text-red-500 font-bold">NG</span>}
                          </td>
                          <td className="p-2 text-red-400 text-[10px]">{row.error || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2 mt-3">
                  <Button size="sm" onClick={handleImportEvents}
                    disabled={!parsedEvents.some((r) => r.valid)}>
                    {parsedEvents.filter((r) => r.valid).length}件をインポート
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setParsedEvents(null)}>キャンセル</Button>
                </div>
              </div>
            )}

            {/* Current events summary */}
            <div className="mt-6">
              <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-2">登録済みイベント ({events.length}件)</h4>
              {events.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">イベントがありません</p>
              ) : (
                <div className="space-y-1">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800 text-xs">
                      <span className="font-medium text-gray-700 dark:text-gray-200 flex-1">{evt.name}</span>
                      <span className="text-gray-400 dark:text-gray-500">{evt.date}</span>
                      <span className="text-gray-400 dark:text-gray-500">{evt.venue || "—"}</span>
                      <span className="font-mono text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{evt.password}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        )}
        {/* === Company Import === */}
        {mode === "companies" && (
          <>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700 dark:text-gray-200">企業CSVインポート</h3>
                <button onClick={exportCompanyTemplate} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium">
                  CSVテンプレート
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">CSV形式: name,tier,tags,cm15,cm30,cm60,offerText,offerUrl,couponCode (tagsはセミコロン区切り)</p>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">CSVファイル</label>
                <input type="file" accept=".csv" onChange={handleCompanyFile} className="text-sm" />
              </div>

              {/* Preview table */}
              {parsedCompanies && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
                      プレビュー: {parsedCompanies.filter((r) => r.valid).length}/{parsedCompanies.length} 件有効
                    </p>
                    {parsedCompanies.some((r) => !r.valid) && (
                      <span className="text-xs text-red-500 font-bold">
                        {parsedCompanies.filter((r) => !r.valid).length}件エラー
                      </span>
                    )}
                  </div>
                  <div className="max-h-60 overflow-auto border dark:border-gray-700 rounded-lg touch-pan-x">
                    <table className="w-full text-xs min-w-[500px]">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800 border-b dark:border-gray-700 sticky top-0">
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">行</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">企業名</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">ティア</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">タグ</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">offerText</th>
                          <th className="p-2 text-center text-gray-500 dark:text-gray-400">状態</th>
                          <th className="p-2 text-left text-gray-500 dark:text-gray-400">エラー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedCompanies.map((row, i) => (
                          <tr key={i} className={`border-b dark:border-gray-700 ${row.valid ? "hover:bg-gray-50 dark:hover:bg-gray-700" : "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/50"}`}>
                            <td className="p-2 text-gray-400 dark:text-gray-500">{i + 2}</td>
                            <td className={`p-2 ${row.valid ? "" : "text-red-600 font-bold"}`}>{row.name || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{row.tier || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{row.tags || "—"}</td>
                            <td className="p-2 text-gray-500 dark:text-gray-400">{row.offerText || "—"}</td>
                            <td className="p-2 text-center">
                              {row.valid
                                ? <span className="text-green-500 font-bold">OK</span>
                                : <span className="text-red-500 font-bold">NG</span>}
                            </td>
                            <td className="p-2 text-red-400 text-[10px]">{row.error || ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <Button size="sm" onClick={handleImportCompanies}
                      disabled={!parsedCompanies.some((r) => r.valid)}>
                      {parsedCompanies.filter((r) => r.valid).length}社をインポート
                    </Button>
                    <Button size="sm" variant="secondary" onClick={() => setParsedCompanies(null)}>キャンセル</Button>
                  </div>
                </div>
              )}
            </Card>

            {/* Existing companies list */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">登録済み企業 ({companies.length}社)</h3>
              {companies.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">企業がありません</p>
              ) : (
                <div className="max-h-80 overflow-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <th className="p-2 text-left">企業名</th>
                        <th className="p-2 text-center">ティア</th>
                        <th className="p-2 text-center">タグ数</th>
                        <th className="p-2 text-center">CM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {companies.map((co) => (
                        <tr key={co.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="p-2 font-medium">{co.name}</td>
                          <td className="p-2 text-center">
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${
                              co.tier === "platinum" ? "bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" :
                              co.tier === "gold" ? "bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400" :
                              co.tier === "silver" ? "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300" :
                              "bg-orange-50 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                            }`}>{co.tier}</span>
                          </td>
                          <td className="p-2 text-center">
                            {co.tags.length > 0
                              ? <span className="text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400 px-1 rounded">{co.tags.length}</span>
                              : "—"}
                          </td>
                          <td className="p-2 text-center">
                            {co.videos.cm15 || co.videos.cm30 || co.videos.cm60
                              ? <span className="text-green-500 text-[10px] font-bold">設定済</span>
                              : <span className="text-gray-400 dark:text-gray-500 text-[10px]">未設定</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
