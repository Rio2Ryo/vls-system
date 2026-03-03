"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredTenants, setStoredTenants, getStoredWebhooks, setStoredWebhooks, getStoredWebhookLog, getRetentionPolicy, setRetentionPolicy, previewDataCleanup, runDataCleanup, getWatermarkConfig, setWatermarkConfig } from "@/lib/store";
import { DEFAULT_WATERMARK_CONFIG, RetentionDays, RetentionPolicy, WatermarkConfig, WatermarkPosition, WebhookConfig, WebhookEventType, WebhookLog } from "@/lib/types";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

const COLOR_PRESETS = [
  "#6EC6FF", "#FF6B6B", "#51CF66", "#FFD43B", "#845EF7",
  "#FF922B", "#20C997", "#F06595", "#339AF0", "#495057",
];

const WEBHOOK_EVENT_OPTIONS: { value: WebhookEventType; label: string }[] = [
  { value: "checkin", label: "チェックイン" },
  { value: "download_complete", label: "DL完了" },
  { value: "cm_viewed", label: "CM視聴" },
  { value: "survey_complete", label: "アンケート回答" },
];

function WebhookSection({ tenantId, onSave }: { tenantId: string | null; onSave: (msg: string) => void }) {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [webhookLog, setWebhookLog] = useState<WebhookLog[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formUrl, setFormUrl] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formEvents, setFormEvents] = useState<WebhookEventType[]>([]);
  const [testing, setTesting] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);

  const reload = useCallback(() => {
    const all = getStoredWebhooks();
    setWebhooks(tenantId ? all.filter((w) => !w.tenantId || w.tenantId === tenantId) : all);
    setWebhookLog(getStoredWebhookLog());
  }, [tenantId]);

  useEffect(() => { reload(); }, [reload]);

  const resetForm = () => {
    setFormUrl("");
    setFormSecret("");
    setFormEvents([]);
    setEditId(null);
    setShowForm(false);
  };

  const handleSaveWebhook = () => {
    if (!formUrl.trim() || formEvents.length === 0) return;
    const all = getStoredWebhooks();

    if (editId) {
      const updated = all.map((w) =>
        w.id === editId
          ? { ...w, url: formUrl.trim(), secret: formSecret.trim() || undefined, events: formEvents }
          : w
      );
      setStoredWebhooks(updated);
      onSave("Webhook を更新しました");
    } else {
      const newWh: WebhookConfig = {
        id: `wh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tenantId: tenantId || undefined,
        url: formUrl.trim(),
        events: formEvents,
        enabled: true,
        secret: formSecret.trim() || undefined,
        createdAt: Date.now(),
      };
      setStoredWebhooks([...all, newWh]);
      onSave("Webhook を追加しました");
    }
    resetForm();
    reload();
  };

  const handleEdit = (wh: WebhookConfig) => {
    setEditId(wh.id);
    setFormUrl(wh.url);
    setFormSecret(wh.secret || "");
    setFormEvents([...wh.events]);
    setShowForm(true);
  };

  const handleDelete = (id: string) => {
    const all = getStoredWebhooks().filter((w) => w.id !== id);
    setStoredWebhooks(all);
    onSave("Webhook を削除しました");
    reload();
  };

  const handleToggle = (id: string) => {
    const all = getStoredWebhooks().map((w) =>
      w.id === id ? { ...w, enabled: !w.enabled } : w
    );
    setStoredWebhooks(all);
    reload();
  };

  const toggleEvent = (evt: WebhookEventType) => {
    setFormEvents((prev) =>
      prev.includes(evt) ? prev.filter((e) => e !== evt) : [...prev, evt]
    );
  };

  const handleTest = async (wh: WebhookConfig) => {
    setTesting(wh.id);
    try {
      const res = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": "test",
          ...(wh.secret ? { "X-Webhook-Secret": wh.secret } : {}),
        },
        body: JSON.stringify({
          event: "test",
          label: "テスト送信",
          timestamp: new Date().toISOString(),
          message: "VLS Webhook テスト送信です",
        }),
      });
      onSave(res.ok ? `テスト成功 (${res.status})` : `テスト失敗 (${res.status})`);
    } catch {
      onSave("テスト失敗 (ネットワークエラー)");
    }
    setTesting(null);
    reload();
  };

  const recentLog = webhookLog
    .filter((l) => webhooks.some((w) => w.id === l.webhookId))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Webhook 外部連携</h2>
        {!showForm && (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="text-xs px-3 py-1.5 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            + 追加
          </button>
        )}
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        イベント発生時に外部URLへPOST通知を送信します（Slack / LINE / Zapier 等）。リトライ3回。
      </p>

      {/* Add / Edit Form */}
      {showForm && (
        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">
            {editId ? "Webhook 編集" : "Webhook 追加"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Webhook URL</label>
              <input
                className={inputCls}
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
                placeholder="https://hooks.slack.com/services/..."
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">シークレット（任意）</label>
              <input
                className={inputCls}
                value={formSecret}
                onChange={(e) => setFormSecret(e.target.value)}
                placeholder="X-Webhook-Secret ヘッダーに送信"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">通知イベント</label>
              <div className="flex flex-wrap gap-2">
                {WEBHOOK_EVENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => toggleEvent(opt.value)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                      formEvents.includes(opt.value)
                        ? "bg-[#6EC6FF] text-white border-[#6EC6FF]"
                        : "bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-[#6EC6FF]"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveWebhook} disabled={!formUrl.trim() || formEvents.length === 0}>
                {editId ? "更新" : "追加"}
              </Button>
              <button
                onClick={resetForm}
                className="text-xs px-3 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 font-medium transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* Webhook list */}
      {webhooks.length === 0 && !showForm ? (
        <Card>
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-6">
            Webhook が設定されていません
          </p>
        </Card>
      ) : (
        webhooks.map((wh) => (
          <Card key={wh.id}>
            <div className="flex items-start gap-3">
              {/* Enable toggle */}
              <button
                onClick={() => handleToggle(wh.id)}
                aria-label={wh.enabled ? "Webhook を無効にする" : "Webhook を有効にする"}
                className={`mt-0.5 w-8 h-5 rounded-full transition-colors flex-shrink-0 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  wh.enabled ? "bg-green-400" : "bg-gray-300 dark:bg-gray-600"
                }`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${wh.enabled ? "left-3.5" : "left-0.5"}`} />
              </button>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono text-gray-700 dark:text-gray-200 truncate" title={wh.url}>
                  {wh.url}
                </p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {wh.events.map((evt) => {
                    const opt = WEBHOOK_EVENT_OPTIONS.find((o) => o.value === evt);
                    return (
                      <span
                        key={evt}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium"
                      >
                        {opt?.label || evt}
                      </span>
                    );
                  })}
                  {wh.secret && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-50 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400 font-medium">
                      Secret
                    </span>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => handleTest(wh)}
                  disabled={testing === wh.id}
                  aria-label="テスト送信"
                  className="text-[10px] px-2 py-1 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:bg-purple-100 font-medium disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                >
                  {testing === wh.id ? "..." : "テスト"}
                </button>
                <button
                  onClick={() => handleEdit(wh)}
                  aria-label="編集"
                  className="text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                >
                  編集
                </button>
                <button
                  onClick={() => handleDelete(wh.id)}
                  aria-label="削除"
                  className="text-[10px] px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  削除
                </button>
              </div>
            </div>
          </Card>
        ))
      )}

      {/* Webhook delivery log */}
      {webhooks.length > 0 && (
        <div>
          <button
            onClick={() => { setShowLog(!showLog); reload(); }}
            className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            {showLog ? "配信ログを閉じる" : `配信ログを表示 (${recentLog.length}件)`}
          </button>

          {showLog && (
            <Card className="mt-2">
              {recentLog.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">配信ログがありません</p>
              ) : (
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <th className="p-2 text-left">日時</th>
                        <th className="p-2 text-center">イベント</th>
                        <th className="p-2 text-center">状態</th>
                        <th className="p-2 text-center">試行</th>
                        <th className="p-2 text-left">URL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentLog.map((log) => {
                        const evtOpt = WEBHOOK_EVENT_OPTIONS.find((o) => o.value === log.eventType);
                        return (
                          <tr key={log.id} className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50">
                            <td className="p-2 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">{formatDate(log.timestamp)}</td>
                            <td className="p-2 text-center">
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium">
                                {evtOpt?.label || log.eventType}
                              </span>
                            </td>
                            <td className={`p-2 text-center font-bold ${log.status === "success" ? "text-green-600" : "text-red-500"}`}>
                              {log.status === "success" ? "成功" : "失敗"}
                              {log.statusCode ? ` (${log.statusCode})` : ""}
                            </td>
                            <td className="p-2 text-center text-gray-400 dark:text-gray-500">{log.attempts}回</td>
                            <td className="p-2 text-gray-600 dark:text-gray-300 max-w-[200px] truncate" title={log.url}>{log.url}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Retention Policy ─── */

const RETENTION_OPTIONS: { value: RetentionDays; label: string }[] = [
  { value: 0, label: "無制限" },
  { value: 30, label: "30日" },
  { value: 60, label: "60日" },
  { value: 90, label: "90日" },
  { value: 180, label: "180日" },
  { value: 365, label: "1年" },
];

const DATA_TYPE_LABELS: Record<string, string> = {
  vls_analytics: "アクセス分析",
  vls_video_plays: "CM再生ログ",
  vls_behavior_events: "行動イベント",
  vls_offer_interactions: "オファー操作",
  vls_audit_log: "監査ログ",
  vls_notification_log: "通知ログ",
  vls_push_logs: "Push配信ログ",
  vls_nps_responses: "NPS回答",
};

const POLICY_KEYS: (keyof Omit<RetentionPolicy, "lastCleanupAt">)[] = [
  "analytics", "videoPlays", "behaviorEvents", "offerInteractions",
  "auditLog", "notificationLog", "pushLogs", "npsResponses",
];

const KEY_TO_STORE_KEY: Record<string, string> = {
  analytics: "vls_analytics",
  videoPlays: "vls_video_plays",
  behaviorEvents: "vls_behavior_events",
  offerInteractions: "vls_offer_interactions",
  auditLog: "vls_audit_log",
  notificationLog: "vls_notification_log",
  pushLogs: "vls_push_logs",
  npsResponses: "vls_nps_responses",
};

function RetentionPolicySection({ onSave }: { onSave: (msg: string) => void }) {
  const [policy, setPolicy] = useState<RetentionPolicy>(getRetentionPolicy);
  const [preview, setPreview] = useState<Record<string, { total: number; expired: number }> | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const handlePolicyChange = (key: keyof Omit<RetentionPolicy, "lastCleanupAt">, value: RetentionDays) => {
    const updated = { ...policy, [key]: value };
    setPolicy(updated);
    setRetentionPolicy(updated);
    setPreview(null);
    onSave("保持ポリシーを更新しました");
  };

  const handlePreview = () => {
    setPreview(previewDataCleanup());
  };

  const totalExpired = preview
    ? Object.values(preview).reduce((sum, v) => sum + v.expired, 0)
    : 0;

  const handleCleanup = () => {
    setCleaning(true);
    const results = runDataCleanup();
    const total = Object.values(results).reduce((sum, v) => sum + v, 0);
    onSave(`クリーンアップ完了: ${total}件のレコードを削除しました`);
    setPolicy(getRetentionPolicy());
    setPreview(null);
    setShowConfirm(false);
    setCleaning(false);
  };

  const formatDate = (ts?: number) => {
    if (!ts) return "未実行";
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">データ保持ポリシー</h2>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          最終クリーンアップ: {formatDate(policy.lastCleanupAt)}
        </span>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        各データ種別の保持期間を設定します。期限を過ぎたレコードは手動またはスケジューラーで削除されます。
      </p>

      {/* Policy settings */}
      <Card>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full text-sm min-w-[500px]" aria-label="データ保持ポリシー設定">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">データ種別</th>
                <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400 font-medium">保持期間</th>
              </tr>
            </thead>
            <tbody>
              {POLICY_KEYS.map((key) => (
                <tr key={key} className="border-b border-gray-50 dark:border-gray-700">
                  <td className="py-2.5 px-2 text-gray-700 dark:text-gray-200">
                    {DATA_TYPE_LABELS[KEY_TO_STORE_KEY[key]] || key}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <select
                      value={policy[key]}
                      onChange={(e) => handlePolicyChange(key, Number(e.target.value) as RetentionDays)}
                      aria-label={`${DATA_TYPE_LABELS[KEY_TO_STORE_KEY[key]]}の保持期間`}
                      className="text-sm px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] bg-white dark:bg-gray-700 dark:text-gray-100"
                    >
                      {RETENTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Preview + Cleanup */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handlePreview}
          aria-label="削除対象をプレビュー"
          className="px-4 py-2 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded-xl text-sm font-medium hover:bg-yellow-100 dark:hover:bg-yellow-900/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
        >
          削除対象をプレビュー
        </button>
        <button
          onClick={() => { handlePreview(); setShowConfirm(true); }}
          disabled={cleaning}
          aria-label="今すぐクリーンアップ実行"
          className="px-4 py-2 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-medium hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          {cleaning ? "実行中..." : "今すぐクリーンアップ"}
        </button>
      </div>

      {/* Preview Table */}
      {preview && !showConfirm && (
        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">削除プレビュー</h3>
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-sm min-w-[400px]" aria-label="削除プレビュー">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">データ種別</th>
                  <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">総件数</th>
                  <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">削除対象</th>
                  <th className="text-center py-2 px-2 text-gray-500 dark:text-gray-400">残件数</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(preview).map(([key, { total, expired }]) => (
                  <tr key={key} className="border-b border-gray-50 dark:border-gray-700">
                    <td className="py-2 px-2 text-gray-700 dark:text-gray-200">{DATA_TYPE_LABELS[key] || key}</td>
                    <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{total}</td>
                    <td className={`py-2 px-2 text-center font-mono font-bold ${expired > 0 ? "text-red-500" : "text-gray-400"}`}>
                      {expired > 0 ? `-${expired}` : "0"}
                    </td>
                    <td className="py-2 px-2 text-center font-mono text-gray-600 dark:text-gray-300">{total - expired}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalExpired === 0 && (
            <p className="text-xs text-green-500 mt-2 text-center">削除対象のレコードはありません。</p>
          )}
        </Card>
      )}

      {/* Confirmation Dialog */}
      {showConfirm && preview && (
        <Card className="border-2 border-red-200 dark:border-red-800">
          <h3 className="font-bold text-red-600 dark:text-red-400 mb-3">クリーンアップ確認</h3>
          {totalExpired > 0 ? (
            <>
              <div className="overflow-x-auto touch-pan-x mb-4">
                <table className="w-full text-sm min-w-[400px]" aria-label="クリーンアップ確認">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400">データ種別</th>
                      <th className="text-center py-2 px-2 text-red-500">削除件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(preview)
                      .filter(([, { expired }]) => expired > 0)
                      .map(([key, { expired }]) => (
                        <tr key={key} className="border-b border-gray-50 dark:border-gray-700">
                          <td className="py-2 px-2 text-gray-700 dark:text-gray-200">{DATA_TYPE_LABELS[key] || key}</td>
                          <td className="py-2 px-2 text-center font-mono font-bold text-red-500">{expired}件</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-red-500 mb-4">
                合計 <strong>{totalExpired}件</strong> のレコードが完全に削除されます。この操作は取り消せません。
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCleanup}
                  disabled={cleaning}
                  className="px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-bold hover:bg-red-600 disabled:opacity-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  {cleaning ? "削除中..." : "削除を実行"}
                </button>
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                >
                  キャンセル
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-green-500 mb-3">削除対象のレコードはありません。</p>
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                閉じる
              </button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watermark Settings Section
// ---------------------------------------------------------------------------

const POSITION_OPTIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "tile", label: "タイル (繰り返し)" },
  { value: "center", label: "中央" },
  { value: "bottom-right", label: "右下" },
  { value: "bottom-left", label: "左下" },
  { value: "top-right", label: "右上" },
  { value: "top-left", label: "左上" },
];

const SAMPLE_IMAGE_URL = "https://ui-avatars.com/api/?name=Sample+Photo&background=87ceeb&color=fff&size=600&font-size=0.2";

function WatermarkSection({ tenantId, onSave }: { tenantId: string; onSave: (msg: string) => void }) {
  const [config, setConfig] = useState<WatermarkConfig>({ tenantId, ...DEFAULT_WATERMARK_CONFIG });
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    setConfig(getWatermarkConfig(tenantId));
  }, [tenantId]);

  // Draw preview whenever config changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const W = 400;
      const H = Math.round((img.height / img.width) * W);
      canvas.width = W;
      canvas.height = H;

      // Draw base image
      ctx.drawImage(img, 0, 0, W, H);

      // Apply blur if enabled
      if (config.blur) {
        ctx.filter = "blur(1.5px)";
        ctx.drawImage(canvas, 0, 0);
        ctx.filter = "none";
      }

      if (!config.enabled || !config.text) return;

      // Draw watermark
      ctx.save();
      ctx.globalAlpha = config.opacity;
      ctx.fillStyle = config.fontColor;
      const fontSize = Math.max(config.fontSize * (W / 600), 10);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      if (config.position === "tile") {
        // Tile pattern
        ctx.save();
        const rad = (config.rotation * Math.PI) / 180;
        ctx.rotate(rad);

        const cols = config.gridCols || 3;
        const rows = config.gridRows || 3;
        const stepX = (W * 1.5) / cols;
        const stepY = (H * 1.5) / rows;
        const offsetX = -W * 0.25;
        const offsetY = -H * 0.25;

        for (let r = 0; r <= rows + 1; r++) {
          for (let c = 0; c <= cols + 1; c++) {
            ctx.fillText(config.text, offsetX + c * stepX, offsetY + r * stepY);
          }
        }
        ctx.restore();
      } else {
        // Single position
        let x = W / 2;
        let y = H / 2;
        ctx.textAlign = "center";

        if (config.position === "bottom-right") { x = W - fontSize * 2; y = H - fontSize; ctx.textAlign = "right"; }
        else if (config.position === "bottom-left") { x = fontSize * 2; y = H - fontSize; ctx.textAlign = "left"; }
        else if (config.position === "top-right") { x = W - fontSize * 2; y = fontSize * 1.5; ctx.textAlign = "right"; }
        else if (config.position === "top-left") { x = fontSize * 2; y = fontSize * 1.5; ctx.textAlign = "left"; }

        // Draw background shadow for readability
        ctx.save();
        const rad = (config.rotation * Math.PI) / 180;
        ctx.translate(x, y);
        ctx.rotate(rad);
        ctx.shadowColor = "rgba(255,255,255,0.5)";
        ctx.shadowBlur = 4;
        ctx.fillText(config.text, 0, 0);
        ctx.restore();
      }

      // Draw image watermark if set
      if (config.imageUrl) {
        const wmImg = new Image();
        wmImg.crossOrigin = "anonymous";
        wmImg.onload = () => {
          const scale = config.imageScale || 0.15;
          const wmW = W * scale;
          const wmH = (wmImg.height / wmImg.width) * wmW;
          ctx.globalAlpha = config.opacity;
          let ix = W - wmW - 10;
          let iy = H - wmH - 10;
          if (config.position === "top-left") { ix = 10; iy = 10; }
          else if (config.position === "top-right") { ix = W - wmW - 10; iy = 10; }
          else if (config.position === "bottom-left") { ix = 10; iy = H - wmH - 10; }
          else if (config.position === "center") { ix = (W - wmW) / 2; iy = (H - wmH) / 2; }
          ctx.drawImage(wmImg, ix, iy, wmW, wmH);
        };
        wmImg.src = config.imageUrl;
      }

      ctx.restore();
    };
    img.src = SAMPLE_IMAGE_URL;
  }, [config]);

  const handleSave = () => {
    setWatermarkConfig(config);
    onSave("ウォーターマーク設定を保存しました");
  };

  const handleReset = () => {
    const reset = { tenantId, ...DEFAULT_WATERMARK_CONFIG };
    setConfig(reset);
    setWatermarkConfig(reset);
    onSave("ウォーターマーク設定をリセットしました");
  };

  const update = (patch: Partial<WatermarkConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ウォーターマーク設定</h2>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
          />
          <span className="text-xs text-gray-600 dark:text-gray-300">有効</span>
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Settings panel */}
        <Card>
          <div className="space-y-4">
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">テキスト設定</h3>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ウォーターマークテキスト</label>
              <input
                className={inputCls}
                value={config.text}
                onChange={(e) => update({ text: e.target.value })}
                placeholder="© テナント名"
                aria-label="ウォーターマークテキスト"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">フォントサイズ: {config.fontSize}px</label>
                <input
                  type="range"
                  min={12}
                  max={72}
                  value={config.fontSize}
                  onChange={(e) => update({ fontSize: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                  aria-label="フォントサイズ"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">透明度: {Math.round(config.opacity * 100)}%</label>
                <input
                  type="range"
                  min={5}
                  max={100}
                  value={Math.round(config.opacity * 100)}
                  onChange={(e) => update({ opacity: Number(e.target.value) / 100 })}
                  className="w-full accent-blue-500"
                  aria-label="透明度"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">文字色</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={config.fontColor}
                    onChange={(e) => update({ fontColor: e.target.value })}
                    className="w-8 h-8 rounded cursor-pointer border-0 p-0"
                    aria-label="文字色ピッカー"
                  />
                  <input
                    className={inputCls + " max-w-[100px]"}
                    value={config.fontColor}
                    onChange={(e) => update({ fontColor: e.target.value })}
                    maxLength={7}
                    aria-label="文字色コード"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">回転: {config.rotation}°</label>
                <input
                  type="range"
                  min={-90}
                  max={90}
                  value={config.rotation}
                  onChange={(e) => update({ rotation: Number(e.target.value) })}
                  className="w-full accent-blue-500"
                  aria-label="回転角度"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">配置</label>
              <select
                className={inputCls}
                value={config.position}
                onChange={(e) => update({ position: e.target.value as WatermarkPosition })}
                aria-label="ウォーターマーク配置"
              >
                {POSITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {config.position === "tile" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">列数: {config.gridCols}</label>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    value={config.gridCols}
                    onChange={(e) => update({ gridCols: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                    aria-label="タイル列数"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">行数: {config.gridRows}</label>
                  <input
                    type="range"
                    min={2}
                    max={6}
                    value={config.gridRows}
                    onChange={(e) => update({ gridRows: Number(e.target.value) })}
                    className="w-full accent-blue-500"
                    aria-label="タイル行数"
                  />
                </div>
              </div>
            )}

            <hr className="border-gray-200 dark:border-gray-700" />

            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">画像ウォーターマーク (オプション)</h3>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">画像URL</label>
              <input
                className={inputCls}
                value={config.imageUrl || ""}
                onChange={(e) => update({ imageUrl: e.target.value || undefined })}
                placeholder="https://example.com/watermark-logo.png"
                aria-label="画像ウォーターマークURL"
              />
            </div>

            {config.imageUrl && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">画像サイズ: {Math.round((config.imageScale || 0.15) * 100)}%</label>
                <input
                  type="range"
                  min={5}
                  max={50}
                  value={Math.round((config.imageScale || 0.15) * 100)}
                  onChange={(e) => update({ imageScale: Number(e.target.value) / 100 })}
                  className="w-full accent-blue-500"
                  aria-label="画像サイズ"
                />
              </div>
            )}

            <hr className="border-gray-200 dark:border-gray-700" />

            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm">その他</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.blur}
                onChange={(e) => update({ blur: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400"
              />
              <span className="text-xs text-gray-600 dark:text-gray-300">プレビュー画像にぼかし効果</span>
            </label>

            <div className="flex gap-2 pt-2">
              <Button size="sm" onClick={handleSave}>保存</Button>
              <button
                onClick={handleReset}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                デフォルトに戻す
              </button>
            </div>
          </div>
        </Card>

        {/* Live preview panel */}
        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">プレビュー</h3>
          <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-2 flex items-center justify-center">
            <canvas
              ref={canvasRef}
              className="max-w-full rounded-lg shadow-sm"
              aria-label="ウォーターマークプレビュー"
            />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2 text-center">
            設定変更はリアルタイムでプレビューに反映されます
          </p>
        </Card>
      </div>
    </div>
  );
}

export default function SettingsTab({ onSave, tenantId }: { onSave: (msg: string) => void; tenantId?: string | null }) {
  const { data: session } = useSession();
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6EC6FF");
  const [tenantName, setTenantName] = useState("");

  const isSuperAdmin = session?.user?.role === "super_admin";
  const activeTenantId = tenantId || session?.user?.tenantId || null;

  useEffect(() => {
    if (!activeTenantId) return;
    const tenants = getStoredTenants();
    const tenant = tenants.find((t) => t.id === activeTenantId);
    if (tenant) {
      setLogoUrl(tenant.logoUrl || "");
      setPrimaryColor(tenant.primaryColor || "#6EC6FF");
      setTenantName(tenant.name);
    }
  }, [activeTenantId]);

  const handleSave = () => {
    if (!activeTenantId) return;
    const tenants = getStoredTenants();
    const updated = tenants.map((t) =>
      t.id === activeTenantId
        ? { ...t, logoUrl: logoUrl || undefined, primaryColor: primaryColor || undefined }
        : t
    );
    setStoredTenants(updated);

    // Apply immediately
    document.documentElement.style.setProperty("--primary", primaryColor || "#6EC6FF");

    onSave("ブランディング設定を保存しました");
  };

  if (!activeTenantId) {
    return (
      <Card>
        <div className="text-center py-8">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            {isSuperAdmin
              ? "テナントを選択してください（ヘッダーのドロップダウンから選択）"
              : "テナント情報が見つかりません"}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Branding settings */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">ブランディング設定</h2>
        {tenantName && (
          <p className="text-sm text-gray-500 dark:text-gray-400">テナント: {tenantName}</p>
        )}

        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">ロゴ</h3>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">ロゴURL</label>
              <input
                className={inputCls}
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
              />
            </div>
            {logoUrl && (
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">プレビュー:</span>
                <img
                  src={logoUrl}
                  alt="logo preview"
                  className="w-12 h-12 rounded-full object-cover border border-gray-200 dark:border-gray-600"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">プライマリカラー</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="プライマリカラーピッカー"
                className="w-10 h-10 rounded cursor-pointer border-0 p-0"
              />
              <input
                className={inputCls + " max-w-[140px]"}
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                aria-label="プライマリカラーコード"
                placeholder="#6EC6FF"
                maxLength={7}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">プリセット</label>
              <div className="flex gap-2 flex-wrap">
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setPrimaryColor(color)}
                    aria-label={`カラー ${color} を選択`}
                    aria-pressed={primaryColor === color}
                    className={`w-8 h-8 rounded-lg border-2 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                      primaryColor === color ? "border-gray-800 dark:border-white scale-110" : "border-transparent"
                    }`}
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">プレビュー</label>
              <div className="flex items-center gap-3">
                <span
                  className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
                  style={{ backgroundColor: primaryColor }}
                >
                  アクティブタブ
                </span>
                <span
                  className="text-xs px-3 py-1.5 rounded-full font-medium text-white shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  ボタン
                </span>
              </div>
            </div>
          </div>
        </Card>

        <Button size="sm" onClick={handleSave}>保存</Button>
      </div>

      {/* Divider */}
      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Webhook settings */}
      <WebhookSection tenantId={activeTenantId} onSave={onSave} />

      {/* Divider */}
      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Watermark settings */}
      <WatermarkSection tenantId={activeTenantId} onSave={onSave} />

      {/* Divider */}
      <hr className="border-gray-200 dark:border-gray-700" />

      {/* Data retention policy */}
      <RetentionPolicySection onSave={onSave} />
    </div>
  );
}
