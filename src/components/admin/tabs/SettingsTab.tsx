"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredTenants, setStoredTenants, getStoredWebhooks, setStoredWebhooks, getStoredWebhookLog } from "@/lib/store";
import { WebhookConfig, WebhookEventType, WebhookLog } from "@/lib/types";

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
                <div className="overflow-x-auto">
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
    </div>
  );
}
