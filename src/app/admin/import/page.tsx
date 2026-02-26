"use client";

import { useCallback, useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { ADMIN_PASSWORD } from "@/lib/data";
import {
  getStoredEvents, setStoredEvents, getStoredParticipants, setStoredParticipants,
  getStoredTenants, getEventsForTenant, getParticipantsForTenant,
} from "@/lib/store";
import { EventData, Participant, InterestTag } from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

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

type ImportMode = "participants" | "events";

export default function ImportPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  const [mode, setMode] = useState<ImportMode>("participants");
  const [events, setEvents] = useState<EventData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);

  // Participant import state
  const [selectedEventId, setSelectedEventId] = useState("");
  const [parsedParticipants, setParsedParticipants] = useState<ParsedParticipantRow[] | null>(null);

  // Event import state
  const [parsedEvents, setParsedEvents] = useState<ParsedEventRow[] | null>(null);

  const [filterEvent, setFilterEvent] = useState("all");

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }, []);

  const reload = useCallback(() => {
    const tid = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") || null : null;
    setTenantId(tid);
    setEvents(tid ? getEventsForTenant(tid) : getStoredEvents());
    setParticipants(tid ? getParticipantsForTenant(tid) : getStoredParticipants());
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (sessionStorage.getItem("adminAuthed") === "true") setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("adminAuthed", "true");
      sessionStorage.removeItem("adminTenantId");
    } else {
      const tenants = getStoredTenants();
      const tenant = tenants.find((t) => t.adminPassword === pw.toUpperCase());
      if (tenant) {
        if (tenant.isActive === false) { setPwError("このテナントは無効化されています"); return; }
        if (tenant.licenseEnd && new Date(tenant.licenseEnd + "T23:59:59") < new Date()) {
          setPwError("ライセンスが期限切れです"); return;
        }
        setAuthed(true);
        sessionStorage.setItem("adminAuthed", "true");
        sessionStorage.setItem("adminTenantId", tenant.id);
        setTenantId(tenant.id);
      } else {
        setPwError("パスワードが違います");
      }
    }
  };

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

  // --- Login screen ---
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">CSVインポート</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="import-password" />
            {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">ログイン</Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader
        title={IS_DEMO_MODE ? "CSVインポート (Demo)" : "CSVインポート"}
        badge={`${participants.length}名登録済`}
        onLogout={() => { setAuthed(false); sessionStorage.removeItem("adminAuthed"); }}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white text-sm px-4 py-2 rounded-xl shadow-lg">
          {toast}
        </div>
      )}

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Mode selector */}
        <div className="flex gap-2">
          <button
            onClick={() => setMode("participants")}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${
              mode === "participants" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            参加者インポート
          </button>
          <button
            onClick={() => setMode("events")}
            className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors ${
              mode === "events" ? "bg-[#6EC6FF] text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            イベントインポート
          </button>
        </div>

        {/* === Participant Import === */}
        {mode === "participants" && (
          <>
            <Card>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-700">参加者CSVインポート</h3>
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
              <p className="text-xs text-gray-400 mb-3">CSV形式: 名前,メールアドレス,タグ (タグはセミコロン区切り)</p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1">対象イベント</label>
                  <select className={inputCls} value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)}>
                    <option value="">イベントを選択...</option>
                    {events.map((evt) => (
                      <option key={evt.id} value={evt.id}>{evt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1">CSVファイル</label>
                  <input type="file" accept=".csv" onChange={handleParticipantFile} className="text-sm" />
                </div>
              </div>

              {/* Preview table with error highlighting */}
              {parsedParticipants && (
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-600">
                      プレビュー: {parsedParticipants.filter((r) => r.valid).length}/{parsedParticipants.length} 件有効
                    </p>
                    {parsedParticipants.some((r) => !r.valid) && (
                      <span className="text-xs text-red-500 font-bold">
                        {parsedParticipants.filter((r) => !r.valid).length}件エラー
                      </span>
                    )}
                  </div>
                  <div className="max-h-60 overflow-y-auto border rounded-lg">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b sticky top-0">
                          <th className="p-2 text-left text-gray-500">行</th>
                          <th className="p-2 text-left text-gray-500">名前</th>
                          <th className="p-2 text-left text-gray-500">メール</th>
                          <th className="p-2 text-left text-gray-500">タグ</th>
                          <th className="p-2 text-center text-gray-500">状態</th>
                          <th className="p-2 text-left text-gray-500">エラー</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedParticipants.map((row, i) => (
                          <tr key={i} className={`border-b ${row.valid ? "hover:bg-gray-50" : "bg-red-50 border-red-100"}`}>
                            <td className="p-2 text-gray-400">{i + 2}</td>
                            <td className={`p-2 ${row.valid ? "" : "text-red-600 font-bold"}`}>{row.name || "—"}</td>
                            <td className="p-2 text-gray-500">{row.email || "—"}</td>
                            <td className="p-2 text-gray-500">{row.tags || "—"}</td>
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
                <h3 className="font-bold text-gray-700">登録済み参加者 ({participants.length}名)</h3>
                <select
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none"
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
                <p className="text-sm text-gray-400 text-center py-6">参加者がいません</p>
              ) : (
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 sticky top-0">
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
                          <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="p-2 font-medium">{p.name}</td>
                            <td className="p-2 text-gray-500">{p.email || "—"}</td>
                            <td className="p-2 text-gray-500">{evt?.name || p.eventId}</td>
                            <td className="p-2 text-center">
                              {p.tags?.length
                                ? <span className="text-[10px] bg-blue-50 text-blue-500 px-1 rounded">{p.tags.length}</span>
                                : "—"}
                            </td>
                            <td className="p-2 text-gray-400 text-center">{new Date(p.registeredAt).toLocaleDateString("ja")}</td>
                            <td className="p-2 text-center">
                              <button onClick={() => handleDeleteParticipant(p.id)} className="text-red-400 hover:text-red-600">x</button>
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
              <h3 className="font-bold text-gray-700">イベントCSVインポート</h3>
              <button onClick={exportEventTemplate} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium">
                CSVテンプレート
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-3">CSV形式: イベント名,日付(YYYY-MM-DD),会場,パスワード,説明</p>
            <div>
              <label className="text-xs text-gray-500 block mb-1">CSVファイル</label>
              <input type="file" accept=".csv" onChange={handleEventFile} className="text-sm" />
            </div>

            {/* Preview table */}
            {parsedEvents && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-600">
                    プレビュー: {parsedEvents.filter((r) => r.valid).length}/{parsedEvents.length} 件有効
                  </p>
                  {parsedEvents.some((r) => !r.valid) && (
                    <span className="text-xs text-red-500 font-bold">
                      {parsedEvents.filter((r) => !r.valid).length}件エラー
                    </span>
                  )}
                </div>
                <div className="max-h-60 overflow-y-auto border rounded-lg">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b sticky top-0">
                        <th className="p-2 text-left text-gray-500">行</th>
                        <th className="p-2 text-left text-gray-500">名前</th>
                        <th className="p-2 text-left text-gray-500">日付</th>
                        <th className="p-2 text-left text-gray-500">会場</th>
                        <th className="p-2 text-left text-gray-500">パスワード</th>
                        <th className="p-2 text-center text-gray-500">状態</th>
                        <th className="p-2 text-left text-gray-500">エラー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsedEvents.map((row, i) => (
                        <tr key={i} className={`border-b ${row.valid ? "hover:bg-gray-50" : "bg-red-50 border-red-100"}`}>
                          <td className="p-2 text-gray-400">{i + 2}</td>
                          <td className={`p-2 ${row.valid ? "" : "text-red-600 font-bold"}`}>{row.name || "—"}</td>
                          <td className="p-2 text-gray-500">{row.date || "—"}</td>
                          <td className="p-2 text-gray-500">{row.venue || "—"}</td>
                          <td className="p-2 text-gray-500 font-mono">{row.password || "—"}</td>
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
              <h4 className="text-sm font-bold text-gray-600 mb-2">登録済みイベント ({events.length}件)</h4>
              {events.length === 0 ? (
                <p className="text-xs text-gray-400">イベントがありません</p>
              ) : (
                <div className="space-y-1">
                  {events.map((evt) => (
                    <div key={evt.id} className="flex items-center gap-3 p-2 rounded-lg bg-gray-50 text-xs">
                      <span className="font-medium text-gray-700 flex-1">{evt.name}</span>
                      <span className="text-gray-400">{evt.date}</span>
                      <span className="text-gray-400">{evt.venue || "—"}</span>
                      <span className="font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">{evt.password}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
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
