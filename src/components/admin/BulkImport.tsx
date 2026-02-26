"use client";

import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { EventData, Participant, InterestTag } from "@/lib/types";
import { getStoredEvents, getStoredParticipants, setStoredParticipants, getEventsForTenant, getParticipantsForTenant } from "@/lib/store";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

interface ParsedRow {
  name: string;
  email: string;
  tags: string;
  valid: boolean;
  error?: string;
}

function parseCSV(text: string): ParsedRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  return lines.slice(1).map((line) => {
    // Handle quoted CSV fields
    const cols: string[] = [];
    let current = "";
    let inQuote = false;
    for (const ch of line) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === "," && !inQuote) { cols.push(current.trim()); current = ""; continue; }
      current += ch;
    }
    cols.push(current.trim());

    const name = cols[0] || "";
    const email = cols[1] || "";
    const tags = cols[2] || "";
    if (!name) return { name, email, tags, valid: false, error: "名前が空です" };
    if (email && !email.includes("@")) return { name, email, tags, valid: false, error: "メール形式が不正" };
    return { name, email, tags, valid: true };
  });
}

export default function BulkImport({ onSave, tenantId }: { onSave: (msg: string) => void; tenantId?: string | null }) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [filterEvent, setFilterEvent] = useState("all");

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setParticipants(tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants());
  }, [tenantId]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setParsed(parseCSV(text));
    };
    reader.readAsText(file);
  };

  const handleImport = () => {
    if (!parsed || !selectedEventId) return;
    const validRows = parsed.filter((r) => r.valid);
    if (validRows.length === 0) return;
    const tenantId = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") || undefined : undefined;
    const newParticipants: Participant[] = validRows.map((row) => ({
      id: `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      eventId: selectedEventId,
      tenantId,
      name: row.name,
      email: row.email || undefined,
      tags: row.tags ? row.tags.split(/[;|]/).map((t) => t.trim()).filter(Boolean) as InterestTag[] : undefined,
      registeredAt: Date.now(),
      checkedIn: false,
    }));
    const updated = [...participants, ...newParticipants];
    setStoredParticipants(updated);
    setParticipants(updated);
    setParsed(null);
    onSave(`${newParticipants.length}名の参加者をインポートしました`);
  };

  const handleDelete = (id: string) => {
    const updated = participants.filter((p) => p.id !== id);
    setStoredParticipants(updated);
    setParticipants(updated);
  };

  const handleClearEvent = (eventId: string) => {
    const updated = participants.filter((p) => p.eventId !== eventId);
    setStoredParticipants(updated);
    setParticipants(updated);
    onSave("イベントの参加者をクリアしました");
  };

  const exportTemplate = () => {
    const csv = "\uFEFF名前,メールアドレス,タグ\n田中太郎,tanaka@example.com,education;sports\n佐藤花子,sato@example.com,technology;art\n山田一郎,yamada@example.com,food;travel\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "participants_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportParticipants = () => {
    const target = filterEvent === "all" ? participants : participants.filter((p) => p.eventId === filterEvent);
    if (target.length === 0) return;
    const header = "名前,メール,イベント,タグ,登録日,チェックイン";
    const rows = target.map((p) => {
      const evt = events.find((e) => e.id === p.eventId);
      return [
        p.name,
        p.email || "",
        evt?.name || p.eventId,
        p.tags?.join(";") || "",
        new Date(p.registeredAt).toLocaleDateString("ja"),
        p.checkedIn ? "Yes" : "No",
      ].join(",");
    });
    const csv = "\uFEFF" + header + "\n" + rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `participants_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredParticipants = filterEvent === "all"
    ? participants
    : participants.filter((p) => p.eventId === filterEvent);

  return (
    <div className="space-y-4" data-testid="admin-import">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">参加者バルクインポート</h2>
        <div className="flex gap-2">
          <button onClick={exportTemplate} className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium">
            CSVテンプレート
          </button>
          {participants.length > 0 && (
            <button onClick={exportParticipants} className="text-xs px-3 py-1.5 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium">
              参加者CSV出力
            </button>
          )}
        </div>
      </div>

      {/* Import form */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">CSVインポート</h3>
        <p className="text-xs text-gray-400 mb-3">CSV形式: 名前,メールアドレス,タグ (タグはセミコロン区切り)</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">対象イベント</label>
            <select className={inputCls} value={selectedEventId} onChange={(e) => setSelectedEventId(e.target.value)} data-testid="import-event-select">
              <option value="">イベントを選択...</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">CSVファイル</label>
            <input type="file" accept=".csv" onChange={handleFileUpload} className="text-sm" data-testid="import-file-input" />
          </div>
        </div>

        {parsed && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-gray-600">
                プレビュー: {parsed.filter((r) => r.valid).length}/{parsed.length} 件有効
              </p>
              {parsed.some((r) => !r.valid) && (
                <span className="text-xs text-red-400">{parsed.filter((r) => !r.valid).length}件エラー</span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-lg">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-2 text-left">名前</th>
                    <th className="p-2 text-left">メール</th>
                    <th className="p-2 text-left">タグ</th>
                    <th className="p-2 text-center">状態</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.map((row, i) => (
                    <tr key={i} className={`border-b ${row.valid ? "" : "bg-red-50"}`}>
                      <td className="p-2">{row.name || "—"}</td>
                      <td className="p-2 text-gray-500">{row.email || "—"}</td>
                      <td className="p-2 text-gray-500">{row.tags || "—"}</td>
                      <td className="p-2 text-center">
                        {row.valid
                          ? <span className="text-green-500 font-bold">OK</span>
                          : <span className="text-red-400" title={row.error}>NG</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" onClick={handleImport} disabled={!selectedEventId || !parsed.some((r) => r.valid)}>
                {parsed.filter((r) => r.valid).length}名をインポート
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setParsed(null)}>キャンセル</Button>
            </div>
          </div>
        )}
      </Card>

      {/* Participant list */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">登録済み参加者 ({participants.length}名)</h3>
          <select
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none"
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
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
          <>
            {filterEvent !== "all" && (
              <button onClick={() => handleClearEvent(filterEvent)} className="text-[10px] text-red-400 hover:text-red-600 mb-2">
                このイベントの参加者をクリア
              </button>
            )}
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
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
                          <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-600">×</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
