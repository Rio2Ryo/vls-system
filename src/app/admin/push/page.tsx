"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredPushSubscriptions,
  getStoredPushLogs,
  getStoredEvents,
} from "@/lib/store";
import { PushSubscriptionRecord, PushLog, PushTrigger, EventData } from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

const TRIGGER_LABELS: Record<PushTrigger, string> = {
  photo_publish: "写真公開",
  nps_request: "NPS依頼",
  offer_expiry: "オファー期限",
  event_reminder: "イベントリマインダー",
  custom: "カスタム",
};

const TRIGGER_COLORS: Record<PushTrigger, string> = {
  photo_publish: "bg-blue-100 text-blue-700",
  nps_request: "bg-purple-100 text-purple-700",
  offer_expiry: "bg-orange-100 text-orange-700",
  event_reminder: "bg-green-100 text-green-700",
  custom: "bg-gray-100 text-gray-700",
};

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PushPage() {
  const { status } = useSession();
  const [subs, setSubs] = useState<PushSubscriptionRecord[]>([]);
  const [logs, setLogs] = useState<PushLog[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [tab, setTab] = useState<"send" | "subs" | "logs">("send");
  const [vapidConfigured, setVapidConfigured] = useState(false);

  // Send form
  const [sendTitle, setSendTitle] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sendUrl, setSendUrl] = useState("/");
  const [sendTrigger, setSendTrigger] = useState<PushTrigger>("custom");
  const [sendEventId, setSendEventId] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/admin";
    }
  }, [status]);

  const reload = () => {
    setSubs(getStoredPushSubscriptions());
    setLogs(getStoredPushLogs());
    setEvents(getStoredEvents());
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    reload();
    // Check VAPID config
    fetch("/api/push-subscribe")
      .then((r) => r.json())
      .then((d) => setVapidConfigured(d.configured))
      .catch(() => {});
  }, [status]);

  // KPIs
  const totalSubs = subs.length;
  const totalSent = logs.reduce((s, l) => s + l.targetCount, 0);
  const totalSuccess = logs.reduce((s, l) => s + l.successCount, 0);
  const deliveryRate = totalSent > 0 ? Math.round((totalSuccess / totalSent) * 100) : 0;

  // Trigger breakdown
  const triggerBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    logs.forEach((l) => {
      map[l.trigger] = (map[l.trigger] || 0) + 1;
    });
    return Object.entries(map)
      .map(([trigger, count]) => ({ trigger: trigger as PushTrigger, count }))
      .sort((a, b) => b.count - a.count);
  }, [logs]);

  const handleSend = async () => {
    if (!sendTitle.trim() || !sendBody.trim()) return;
    setSending(true);
    setSendResult(null);

    try {
      const res = await fetch("/api/push-send", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          title: sendTitle.trim(),
          body: sendBody.trim(),
          url: sendUrl.trim() || "/",
          trigger: sendTrigger,
          eventId: sendEventId || undefined,
          sentBy: "admin",
        }),
      });
      const data = await res.json();
      if (data.ok) {
        setSendResult(
          `${data.mode === "demo" ? "[デモ] " : ""}${data.targetCount}件送信 → 成功${data.successCount} / 失敗${data.failCount}`
        );
        setSendTitle("");
        setSendBody("");
        reload();
      } else {
        setSendResult(`エラー: ${data.error}`);
      }
    } catch {
      setSendResult("送信に失敗しました");
    }
    setSending(false);
  };

  // Preset templates
  const applyPreset = (trigger: PushTrigger) => {
    setSendTrigger(trigger);
    switch (trigger) {
      case "photo_publish":
        setSendTitle("写真が公開されました!");
        setSendBody("イベント写真がダウンロード可能になりました。今すぐチェック!");
        setSendUrl("/photos");
        break;
      case "nps_request":
        setSendTitle("アンケートのお願い");
        setSendBody("イベントはいかがでしたか？簡単なアンケートにご協力ください。");
        setSendUrl("/survey-nps");
        break;
      case "offer_expiry":
        setSendTitle("クーポン期限間近!");
        setSendBody("スポンサーからのクーポンの有効期限が迫っています。お早めにご利用ください。");
        setSendUrl("/complete");
        break;
      case "event_reminder":
        setSendTitle("明日はイベントです!");
        setSendBody("お忘れなく！明日のイベントに参加予定です。");
        setSendUrl("/");
        break;
      default:
        break;
    }
  };

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <AdminHeader
          title="Push通知管理"
          badge={`${totalSubs}件登録`}
          onLogout={() => signOut({ callbackUrl: "/admin" })}
        />

        {/* VAPID status */}
        {!vapidConfigured && (
          <Card>
            <div className="flex items-center gap-3 text-sm">
              <span className="text-yellow-500 text-lg">⚠</span>
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200">VAPID鍵が未設定です</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  デモモードで動作中。本番Push配信には <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">VAPID_PUBLIC_KEY</code> と <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">VAPID_PRIVATE_KEY</code> を設定してください。
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "登録デバイス", value: `${totalSubs}件`, color: "#6EC6FF" },
            { label: "総送信数", value: `${totalSent}件`, color: "#A78BFA" },
            { label: "配信成功", value: `${totalSuccess}件`, color: "#51CF66" },
            { label: "配信率", value: `${deliveryRate}%`, color: "#FFD43B" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{kpi.label}</p>
            </Card>
          ))}
        </div>

        {/* Trigger breakdown */}
        {triggerBreakdown.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {triggerBreakdown.map(({ trigger, count }) => (
              <span
                key={trigger}
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${TRIGGER_COLORS[trigger]}`}
              >
                {TRIGGER_LABELS[trigger]} ({count}回)
              </span>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2" role="tablist" aria-label="Push通知タブ">
          {[
            { key: "send" as const, label: "通知送信" },
            { key: "subs" as const, label: `登録一覧 (${subs.length})` },
            { key: "logs" as const, label: `配信ログ (${logs.length})` },
          ].map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`text-xs px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                tab === t.key
                  ? "bg-[#6EC6FF] text-white"
                  : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Send Tab */}
        {tab === "send" && (
          <div className="space-y-4">
            {/* Presets */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">テンプレート</h3>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(TRIGGER_LABELS) as PushTrigger[])
                  .filter((t) => t !== "custom")
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => applyPreset(t)}
                      aria-label={`${TRIGGER_LABELS[t]}テンプレートを適用`}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                        sendTrigger === t
                          ? "bg-[#6EC6FF] text-white border-[#6EC6FF]"
                          : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#6EC6FF]"
                      }`}
                    >
                      {TRIGGER_LABELS[t]}
                    </button>
                  ))}
              </div>
            </Card>

            {/* Send Form */}
            <Card>
              <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">通知作成</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">タイトル</label>
                  <input
                    className={inputCls}
                    aria-label="通知タイトル"
                    value={sendTitle}
                    onChange={(e) => setSendTitle(e.target.value)}
                    placeholder="写真が公開されました!"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">本文</label>
                  <textarea
                    className={inputCls + " min-h-[60px]"}
                    aria-label="通知本文"
                    value={sendBody}
                    onChange={(e) => setSendBody(e.target.value)}
                    placeholder="イベント写真がダウンロード可能になりました。"
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">遷移先URL</label>
                    <input
                      className={inputCls}
                      aria-label="遷移先URL"
                      value={sendUrl}
                      onChange={(e) => setSendUrl(e.target.value)}
                      placeholder="/"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">対象イベント (任意)</label>
                    <select
                      className={inputCls}
                      aria-label="対象イベント"
                      value={sendEventId}
                      onChange={(e) => setSendEventId(e.target.value)}
                    >
                      <option value="">全デバイス</option>
                      {events.map((evt) => (
                        <option key={evt.id} value={evt.id}>{evt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleSend}
                    disabled={sending || !sendTitle.trim() || !sendBody.trim()}
                    aria-label="Push通知を送信"
                    className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                  >
                    {sending ? "送信中..." : `${subs.length}件に送信`}
                  </button>
                  {sendResult && (
                    <span className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-3 py-1.5 rounded-lg" role="status" aria-live="polite">
                      {sendResult}
                    </span>
                  )}
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Subscriptions Tab */}
        {tab === "subs" && (
          <Card>
            {subs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">登録デバイスがありません</p>
            ) : (
              <div className="overflow-x-auto touch-pan-x">
                <table className="w-full text-xs min-w-[600px]" aria-label="Push通知登録デバイス一覧">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="p-2 text-left">登録日</th>
                      <th className="p-2 text-left">エンドポイント</th>
                      <th className="p-2 text-left">参加者</th>
                      <th className="p-2 text-left">イベント</th>
                    </tr>
                  </thead>
                  <tbody>
                    {subs.map((sub) => {
                      const evt = events.find((e) => e.id === sub.eventId);
                      return (
                        <tr key={sub.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                          <td className="p-2 text-gray-500 font-mono whitespace-nowrap">{fmtDate(sub.createdAt)}</td>
                          <td className="p-2 text-gray-600 dark:text-gray-300 max-w-[300px] truncate" title={sub.endpoint}>
                            {sub.endpoint}
                          </td>
                          <td className="p-2 text-gray-700 dark:text-gray-200">{sub.participantName || "—"}</td>
                          <td className="p-2 text-gray-600 dark:text-gray-300">{evt?.name || sub.eventId || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Logs Tab */}
        {tab === "logs" && (
          <Card>
            {logs.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">配信ログがありません</p>
            ) : (
              <div className="overflow-x-auto touch-pan-x">
                <table className="w-full text-xs min-w-[700px]" aria-label="Push通知配信ログ">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                      <th className="p-2 text-left">日時</th>
                      <th className="p-2 text-center">種別</th>
                      <th className="p-2 text-left">タイトル</th>
                      <th className="p-2 text-center">対象</th>
                      <th className="p-2 text-center">成功</th>
                      <th className="p-2 text-center">失敗</th>
                      <th className="p-2 text-left">送信者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                        <td className="p-2 text-gray-500 font-mono whitespace-nowrap">{fmtDate(log.timestamp)}</td>
                        <td className="p-2 text-center">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${TRIGGER_COLORS[log.trigger]}`}>
                            {TRIGGER_LABELS[log.trigger]}
                          </span>
                        </td>
                        <td className="p-2 text-gray-700 dark:text-gray-200">
                          <div>{log.title}</div>
                          <div className="text-[10px] text-gray-400 truncate max-w-[200px]">{log.body}</div>
                        </td>
                        <td className="p-2 text-center font-mono">{log.targetCount}</td>
                        <td className="p-2 text-center font-mono text-green-600">{log.successCount}</td>
                        <td className="p-2 text-center font-mono text-red-500">{log.failCount}</td>
                        <td className="p-2 text-gray-500">{log.sentBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
