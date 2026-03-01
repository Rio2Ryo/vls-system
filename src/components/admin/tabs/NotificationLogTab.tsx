"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { NotificationLog } from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";
import { getStoredNotificationLog, addNotificationLog, updateNotificationLog } from "@/lib/store";

const NOTIF_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  registration: { label: "参加通知", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  cm_complete: { label: "CM完了", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  license_expiry: { label: "期限通知", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
  test: { label: "テスト", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
};

const NOTIF_STATUS_COLORS: Record<string, string> = {
  sent: "text-green-600",
  failed: "text-red-600",
  logged: "text-gray-500 dark:text-gray-400",
};

const METHOD_LABELS: Record<string, string> = {
  resend: "Resend",
  sendgrid: "SendGrid",
  logged: "ログのみ",
  pending: "送信中...",
  error: "エラー",
  unknown: "不明",
};

interface ProviderStatus {
  providers: {
    resend: { configured: boolean; keyPrefix: string | null };
    sendgrid: { configured: boolean; keyPrefix: string | null };
  };
  fromAddress: string;
  activeProvider: string | null;
}

export default function NotificationLogTab() {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus | null>(null);

  const reload = () => setLogs(getStoredNotificationLog());

  useEffect(() => {
    reload();
    fetch("/api/notify").then((r) => r.json()).then(setProviderStatus).catch(() => {});
  }, []);

  const filtered = typeFilter === "all" ? logs : logs.filter((l) => l.type === typeFilter);
  const sorted = [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  const typeCounts = {
    registration: logs.filter((l) => l.type === "registration").length,
    cm_complete: logs.filter((l) => l.type === "cm_complete").length,
    license_expiry: logs.filter((l) => l.type === "license_expiry").length,
  };

  const statusCounts = {
    sent: logs.filter((l) => l.status === "sent").length,
    failed: logs.filter((l) => l.status === "failed").length,
    logged: logs.filter((l) => l.status === "logged").length,
  };

  const handleTestSend = async () => {
    if (!testEmail || sending) return;
    setSending(true);
    setTestResult(null);

    const logId = `nl-test-${Date.now()}`;
    addNotificationLog({
      id: logId,
      eventId: "test",
      type: "registration",
      to: testEmail,
      subject: "[VLS] テスト送信",
      status: "logged",
      method: "pending",
      timestamp: Date.now(),
    });

    try {
      const res = await fetch("/api/notify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          to: testEmail,
          eventName: "テスト送信",
          type: "registration",
          participantName: "テストユーザー",
        }),
      });
      const data = await res.json();
      const status = data.status === "sent" ? "sent" : data.status === "failed" ? "failed" : "logged";
      updateNotificationLog(logId, { status, method: data.method || "unknown" });

      if (data.status === "sent") {
        setTestResult({ ok: true, msg: `送信成功 (${data.method})` });
      } else if (data.errors && data.errors.length > 0) {
        const errDetails = data.errors.map((e: { provider: string; error: string }) => `${e.provider}: ${e.error}`).join(" / ");
        setTestResult({ ok: false, msg: data.note ? `${data.note}\n詳細: ${errDetails}` : errDetails });
      } else if (data.note) {
        setTestResult({ ok: false, msg: data.note });
      } else {
        setTestResult({ ok: false, msg: `送信結果: ${data.method || "logged"}` });
      }
    } catch {
      updateNotificationLog(logId, { status: "failed", method: "error" });
      setTestResult({ ok: false, msg: "API呼び出しに失敗しました" });
    }

    setSending(false);
    reload();
  };

  return (
    <div className="space-y-4" data-testid="admin-notifications">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">通知ログ</h2>
        <div className="flex items-center gap-2">
          <button onClick={reload} aria-label="通知ログを更新" className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">更新</button>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            aria-label="通知タイプで絞り込み"
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus:border-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF] dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="all">全タイプ ({logs.length}件)</option>
            <option value="registration">参加通知 ({typeCounts.registration})</option>
            <option value="cm_complete">CM完了 ({typeCounts.cm_complete})</option>
            <option value="license_expiry">期限通知 ({typeCounts.license_expiry})</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Object.entries(typeCounts).map(([type, count]) => {
          const info = NOTIF_TYPE_LABELS[type] || { label: type, color: "bg-gray-100 text-gray-600" };
          return (
            <Card key={type} className="text-center">
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{count}</p>
              <p className={`text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mt-1 ${info.color}`}>{info.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Delivery stats */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">配信ステータス</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center">
            <p className="text-xl font-bold text-green-600">{statusCounts.sent}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">送信済</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-red-500">{statusCounts.failed}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">失敗</p>
          </div>
          <div className="text-center">
            <p className="text-xl font-bold text-gray-400 dark:text-gray-500">{statusCounts.logged}</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">ログのみ</p>
          </div>
        </div>
      </Card>

      {/* Email provider status */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">メール設定状況</h3>
        {providerStatus ? (
          <div className="space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${providerStatus.providers.resend.configured ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600"}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${providerStatus.providers.resend.configured ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                <span className="font-medium text-gray-700 dark:text-gray-200">Resend</span>
                <span className={providerStatus.providers.resend.configured ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
                  {providerStatus.providers.resend.configured ? `設定済 (${providerStatus.providers.resend.keyPrefix})` : "未設定"}
                </span>
                {providerStatus.activeProvider === "resend" && (
                  <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-bold ml-auto">優先</span>
                )}
              </div>
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${providerStatus.providers.sendgrid.configured ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800" : "bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-600"}`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${providerStatus.providers.sendgrid.configured ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                <span className="font-medium text-gray-700 dark:text-gray-200">SendGrid</span>
                <span className={providerStatus.providers.sendgrid.configured ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}>
                  {providerStatus.providers.sendgrid.configured ? `設定済 (${providerStatus.providers.sendgrid.keyPrefix})` : "未設定"}
                </span>
                {providerStatus.activeProvider === "sendgrid" && (
                  <span className="text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-bold ml-auto">フォールバック</span>
                )}
              </div>
            </div>
            <p className="text-[10px] text-gray-400 dark:text-gray-500">
              送信元: {providerStatus.fromAddress}
              {!providerStatus.activeProvider && " — プロバイダー未設定のため、送信はログのみ記録されます"}
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500">設定状況を読み込み中...</p>
        )}
      </Card>

      {/* Test send */}
      <Card>
        <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">テスト送信</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">メール配信が正しく設定されているかテストします。</p>
        <div className="flex gap-2 items-center">
          <input
            type="email"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="test@example.com"
            aria-label="テスト送信先メールアドレス"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            data-testid="test-email-input"
          />
          <button
            onClick={handleTestSend}
            disabled={!testEmail || sending}
            aria-label="テストメールを送信"
            className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium disabled:opacity-50 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            data-testid="test-email-send"
          >
            {sending ? "送信中..." : "テスト送信"}
          </button>
        </div>
        {testResult && (
          <div className={`mt-2 text-xs px-3 py-2 rounded-lg ${testResult.ok ? "bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800"}`}>
            {testResult.msg}
          </div>
        )}
      </Card>

      {/* Log table */}
      {sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">通知ログがありません</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-xs min-w-[640px]" data-testid="notification-log-table">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <th className="p-2 text-left">日時</th>
                  <th className="p-2 text-center">タイプ</th>
                  <th className="p-2 text-left">宛先</th>
                  <th className="p-2 text-left">件名</th>
                  <th className="p-2 text-center">状態</th>
                  <th className="p-2 text-center">送信方法</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((log) => {
                  const typeInfo = NOTIF_TYPE_LABELS[log.type] || { label: log.type, color: "bg-gray-100 text-gray-600" };
                  const dt = new Date(log.timestamp);
                  const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                  return (
                    <tr key={log.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                      <td className="p-2 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{dateStr}</td>
                      <td className="p-2 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${typeInfo.color}`}>{typeInfo.label}</span>
                      </td>
                      <td className="p-2 text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{log.to}</td>
                      <td className="p-2 text-gray-700 dark:text-gray-200 max-w-[240px] truncate" title={log.subject}>{log.subject}</td>
                      <td className={`p-2 text-center font-bold ${NOTIF_STATUS_COLORS[log.status] || "text-gray-500"}`}>
                        {log.status === "sent" ? "送信済" : log.status === "failed" ? "失敗" : "記録済"}
                      </td>
                      <td className="p-2 text-center text-gray-400 dark:text-gray-500">{METHOD_LABELS[log.method || ""] || log.method || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-gray-300 dark:text-gray-500 mt-2 text-right">最新200件を表示</p>
        </Card>
      )}
    </div>
  );
}
