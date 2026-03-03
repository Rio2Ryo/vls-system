"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredScheduledTasks,
  addScheduledTask,
  updateScheduledTask,
  deleteScheduledTask,
  getStoredTaskExecutionLogs,
  addTaskExecutionLog,
  getStoredEvents,
  getPendingScheduledTasks,
} from "@/lib/store";
import { ScheduledTask, ScheduledTaskType, ScheduledTaskStatus, TaskExecutionLog, EventData } from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

const TASK_TYPE_MAP: Record<ScheduledTaskType, { label: string; color: string; icon: string }> = {
  photo_publish: { label: "写真公開", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400", icon: "\u{1F4F7}" },
  photo_archive: { label: "写真アーカイブ", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400", icon: "\u{1F4E6}" },
  nps_send: { label: "NPS送信", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400", icon: "\u{1F4CA}" },
  report_generate: { label: "レポート生成", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400", icon: "\u{1F4C4}" },
  event_expire: { label: "期限チェック", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400", icon: "\u23F0" },
  weekly_digest: { label: "週次ダイジェスト", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400", icon: "\u{1F4E7}" },
  data_cleanup: { label: "データクリーンアップ", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-400", icon: "\u{1F9F9}" },
};

const STATUS_MAP: Record<ScheduledTaskStatus, { label: string; color: string }> = {
  pending: { label: "待機中", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400" },
  running: { label: "実行中", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400" },
  completed: { label: "完了", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
  failed: { label: "失敗", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
  cancelled: { label: "キャンセル", color: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" },
};

const TASK_TYPES: ScheduledTaskType[] = [
  "photo_publish",
  "photo_archive",
  "nps_send",
  "report_generate",
  "event_expire",
  "weekly_digest",
  "data_cleanup",
];

const inputCls =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100";

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function durationStr(startMs: number, endMs: number): string {
  const diff = endMs - startMs;
  if (diff < 1000) return `${diff}ms`;
  return `${(diff / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

type TabKey = "list" | "create" | "logs";

interface TaskForm {
  name: string;
  type: ScheduledTaskType;
  eventId: string;
  scheduledAt: string;
  recurring: boolean;
  recurringIntervalHours: string;
}

const EMPTY_FORM: TaskForm = {
  name: "",
  type: "photo_publish",
  eventId: "",
  scheduledAt: "",
  recurring: false,
  recurringIntervalHours: "24",
};

export default function SchedulerPage() {
  const { data: session, status } = useSession();

  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [logs, setLogs] = useState<TaskExecutionLog[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [tab, setTab] = useState<TabKey>("list");
  const [form, setForm] = useState<TaskForm>(EMPTY_FORM);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [digestSending, setDigestSending] = useState(false);

  const tenantId =
    session?.user?.tenantId ??
    (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ??
    null;

  // -- Toast helper --
  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // -- Load data --
  const reload = useCallback(() => {
    const allTasks = getStoredScheduledTasks();
    const filtered = tenantId ? allTasks.filter((t) => t.tenantId === tenantId) : allTasks;
    setTasks(filtered);
    setLogs(getStoredTaskExecutionLogs());
    const allEvents = getStoredEvents();
    setEvents(tenantId ? allEvents.filter((e) => e.tenantId === tenantId) : allEvents);
  }, [tenantId]);

  useEffect(() => {
    if (status !== "authenticated") return;
    reload();
  }, [status, reload]);

  // -- Auto-check for due tasks (30s interval) --
  useEffect(() => {
    if (status !== "authenticated") return;

    const checkDue = () => {
      const due = getPendingScheduledTasks();
      if (due.length === 0) return;
      for (const task of due) {
        executeTask(task);
      }
    };

    const interval = setInterval(checkDue, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // -- KPI values --
  const kpi = useMemo(() => {
    const total = tasks.length;
    const pending = tasks.filter((t) => t.status === "pending").length;
    const completed = tasks.filter((t) => t.status === "completed").length;
    const failed = tasks.filter((t) => t.status === "failed").length;
    return { total, pending, completed, failed };
  }, [tasks]);

  // -- Execute task --
  const executeTask = useCallback(
    async (task: ScheduledTask) => {
      const startedAt = Date.now();
      updateScheduledTask(task.id, { status: "running" });
      reload();

      try {
        const res = await fetch("/api/lifecycle", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ taskId: task.id, action: "execute" }),
        });

        const completedAt = Date.now();

        if (res.ok) {
          const body = (await res.json()) as { message?: string };
          updateScheduledTask(task.id, {
            status: "completed",
            executedAt: completedAt,
            result: body.message ?? "成功",
          });
          addTaskExecutionLog({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            status: "success",
            startedAt,
            completedAt,
            result: body.message ?? "成功",
          });
          // If recurring, schedule next occurrence
          if (task.recurring && task.recurringIntervalMs) {
            const nextTask: ScheduledTask = {
              id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: task.name,
              type: task.type,
              eventId: task.eventId,
              tenantId: task.tenantId,
              scheduledAt: completedAt + task.recurringIntervalMs,
              status: "pending",
              createdAt: completedAt,
              createdBy: task.createdBy,
              recurring: true,
              recurringIntervalMs: task.recurringIntervalMs,
            };
            addScheduledTask(nextTask);
          }
          showToast(`タスク「${task.name}」を実行しました`, "success");
        } else {
          const errBody = (await res.json().catch(() => ({}))) as { error?: string };
          const errMsg = errBody.error ?? `HTTP ${res.status}`;
          updateScheduledTask(task.id, {
            status: "failed",
            executedAt: completedAt,
            result: errMsg,
          });
          addTaskExecutionLog({
            id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            taskId: task.id,
            taskName: task.name,
            taskType: task.type,
            status: "failed",
            startedAt,
            completedAt,
            result: errMsg,
          });
          showToast(`タスク「${task.name}」が失敗しました: ${errMsg}`, "error");
        }
      } catch (err: unknown) {
        const completedAt = Date.now();
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        updateScheduledTask(task.id, {
          status: "failed",
          executedAt: completedAt,
          result: errMsg,
        });
        addTaskExecutionLog({
          id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          taskId: task.id,
          taskName: task.name,
          taskType: task.type,
          status: "failed",
          startedAt,
          completedAt,
          result: errMsg,
        });
        showToast(`タスク「${task.name}」が失敗しました: ${errMsg}`, "error");
      }

      reload();
    },
    [reload, showToast],
  );

  // -- Cancel task --
  const cancelTask = useCallback(
    (task: ScheduledTask) => {
      updateScheduledTask(task.id, { status: "cancelled" });
      reload();
      showToast(`タスク「${task.name}」をキャンセルしました`);
    },
    [reload, showToast],
  );

  // -- Delete task --
  const removeTask = useCallback(
    (task: ScheduledTask) => {
      deleteScheduledTask(task.id);
      reload();
      showToast(`タスク「${task.name}」を削除しました`);
    },
    [reload, showToast],
  );

  // -- Create task --
  const createTask = useCallback(() => {
    if (!form.name.trim() || !form.scheduledAt) {
      showToast("タスク名と実行日時は必須です", "error");
      return;
    }
    const scheduledMs = new Date(form.scheduledAt).getTime();
    if (Number.isNaN(scheduledMs)) {
      showToast("実行日時の形式が不正です", "error");
      return;
    }
    const intervalHours = parseFloat(form.recurringIntervalHours);
    const intervalMs = form.recurring && intervalHours > 0 ? intervalHours * 3600000 : undefined;

    const newTask: ScheduledTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: form.name.trim(),
      type: form.type,
      eventId: form.eventId || undefined,
      tenantId: tenantId || undefined,
      scheduledAt: scheduledMs,
      status: "pending",
      createdAt: Date.now(),
      createdBy: session?.user?.name ?? "admin",
      recurring: form.recurring || undefined,
      recurringIntervalMs: intervalMs,
    };

    addScheduledTask(newTask);
    setForm(EMPTY_FORM);
    reload();
    showToast(`タスク「${newTask.name}」を作成しました`);
    setTab("list");
  }, [form, tenantId, session?.user?.name, reload, showToast]);

  // -- CSV export --
  const exportLogsCsv = useCallback(() => {
    if (logs.length === 0) return;
    const header = "ID,タスクID,タスク名,タイプ,ステータス,開始時刻,完了時刻,結果\n";
    const rows = logs
      .map(
        (l) =>
          `${l.id},${l.taskId},"${l.taskName}",${l.taskType},${l.status},${formatDateTime(l.startedAt)},${formatDateTime(l.completedAt)},"${(l.result ?? "").replace(/"/g, '""')}"`,
      )
      .join("\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `scheduler_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logs]);

  // -- Manual digest send --
  const sendDigestNow = useCallback(async () => {
    setDigestSending(true);
    try {
      const res = await fetch("/api/digest", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ tenantId: tenantId || undefined }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const sentCount = (data.results as { status: string }[]).filter(
          (r) => r.status === "sent" || r.status === "logged",
        ).length;
        showToast(`週次ダイジェストを${sentCount}件送信しました (${data.weekLabel})`, "success");
      } else {
        showToast(`ダイジェスト送信失敗: ${data.error || "不明なエラー"}`, "error");
      }
    } catch (err) {
      showToast(`ダイジェスト送信失敗: ${err instanceof Error ? err.message : "通信エラー"}`, "error");
    } finally {
      setDigestSending(false);
    }
  }, [tenantId, showToast]);

  // -- Event name lookup --
  const eventName = useCallback(
    (eventId?: string) => {
      if (!eventId) return "-";
      return events.find((e) => e.id === eventId)?.name ?? eventId;
    },
    [events],
  );

  // -- Loading --
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
          <p className="text-sm text-gray-400 dark:text-gray-500">スケジューラーを読み込み中...</p>
        </div>
      </main>
    );
  }

  // -- Auth guard --
  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/admin";
    return null;
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const tabBtnCls = (key: TabKey) =>
    `text-sm px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
      tab === key
        ? "bg-[#6EC6FF] text-white shadow-sm"
        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="スケジューラー"
        badge={`${kpi.total}件`}
        onLogout={() => {
          sessionStorage.removeItem("adminTenantId");
          signOut({ redirect: false });
        }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className={`px-4 py-2 rounded-xl text-sm text-center border ${
              toast.type === "success"
                ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
            }`}
          >
            {toast.message}
          </div>
        )}

        {/* Quick Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={sendDigestNow}
            disabled={digestSending}
            aria-label="週次ダイジェストを今すぐ送信"
            className="text-sm px-4 py-2 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 flex items-center gap-2"
          >
            {digestSending ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                送信中...
              </>
            ) : (
              <>📧 週次ダイジェスト送信</>
            )}
          </button>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            テナント管理者にKPIサマリーメールを即時送信
          </span>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">全タスク</p>
            <p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">{kpi.total}</p>
          </Card>
          <Card>
            <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium">待機中</p>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400 mt-1">{kpi.pending}</p>
          </Card>
          <Card>
            <p className="text-xs text-green-600 dark:text-green-400 font-medium">完了</p>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{kpi.completed}</p>
          </Card>
          <Card>
            <p className="text-xs text-red-600 dark:text-red-400 font-medium">失敗</p>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{kpi.failed}</p>
          </Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2" role="tablist" aria-label="スケジューラータブ">
          <button role="tab" aria-selected={tab === "list"} aria-controls="panel-list" className={tabBtnCls("list")} onClick={() => setTab("list")}>
            タスク一覧
          </button>
          <button role="tab" aria-selected={tab === "create"} aria-controls="panel-create" className={tabBtnCls("create")} onClick={() => setTab("create")}>
            新規タスク
          </button>
          <button role="tab" aria-selected={tab === "logs"} aria-controls="panel-logs" className={tabBtnCls("logs")} onClick={() => setTab("logs")}>
            実行ログ
          </button>
        </div>

        {/* Tab: Task List */}
        {tab === "list" && (
          <div id="panel-list" role="tabpanel">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">タスク一覧</h2>
                <span className="text-xs text-gray-400 dark:text-gray-500">{tasks.length}件</span>
              </div>

              {tasks.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  タスクがありません。「新規タスク」タブからタスクを作成してください。
                </p>
              ) : (
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-sm" aria-label="スケジュールタスク一覧">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">ステータス</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">タイプ</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">タスク名</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">イベント</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">予定日時</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks
                        .sort((a, b) => b.scheduledAt - a.scheduledAt)
                        .map((task) => {
                          const typeInfo = TASK_TYPE_MAP[task.type];
                          const statusInfo = STATUS_MAP[task.status];
                          return (
                            <tr key={task.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="py-2.5 pr-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusInfo.color}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo.color}`}>
                                  {typeInfo.icon} {typeInfo.label}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap">
                                {task.name}
                                {task.recurring && (
                                  <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400 font-medium">
                                    繰返
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                {eventName(task.eventId)}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                                {formatDateTime(task.scheduledAt)}
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center gap-2">
                                  {task.status === "pending" && (
                                    <button
                                      onClick={() => executeTask(task)}
                                      aria-label={`${task.name}を今すぐ実行`}
                                      className="text-xs px-2.5 py-1 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                    >
                                      実行
                                    </button>
                                  )}
                                  {(task.status === "pending" || task.status === "running") && (
                                    <button
                                      onClick={() => cancelTask(task)}
                                      aria-label={`${task.name}をキャンセル`}
                                      className="text-xs text-orange-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 rounded"
                                    >
                                      キャンセル
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeTask(task)}
                                    aria-label={`${task.name}を削除`}
                                    className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                                  >
                                    削除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}

        {/* Tab: Create Task */}
        {tab === "create" && (
          <div id="panel-create" role="tabpanel">
            <Card>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">新規タスク作成</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label htmlFor="task-name" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                    タスク名 *
                  </label>
                  <input
                    id="task-name"
                    className={inputCls}
                    placeholder="例: 夏祭り写真公開"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>

                {/* Type */}
                <div>
                  <label htmlFor="task-type" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                    タイプ *
                  </label>
                  <select
                    id="task-type"
                    className={inputCls}
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as ScheduledTaskType })}
                    aria-label="タスクタイプ選択"
                  >
                    {TASK_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {TASK_TYPE_MAP[t].icon} {TASK_TYPE_MAP[t].label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Event */}
                <div>
                  <label htmlFor="task-event" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                    対象イベント
                  </label>
                  <select
                    id="task-event"
                    className={inputCls}
                    value={form.eventId}
                    onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                    aria-label="対象イベント選択"
                  >
                    <option value="">-- 選択なし --</option>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Scheduled datetime */}
                <div>
                  <label htmlFor="task-scheduled" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                    実行予定日時 *
                  </label>
                  <input
                    id="task-scheduled"
                    type="datetime-local"
                    className={inputCls}
                    value={form.scheduledAt}
                    onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  />
                </div>

                {/* Recurring */}
                <div className="md:col-span-2">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-200">
                      <input
                        type="checkbox"
                        checked={form.recurring}
                        onChange={(e) => setForm({ ...form, recurring: e.target.checked })}
                        className="rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF] w-4 h-4"
                      />
                      繰り返し実行
                    </label>
                    {form.recurring && (
                      <div className="flex items-center gap-2">
                        <label htmlFor="task-interval" className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                          間隔 (時間):
                        </label>
                        <input
                          id="task-interval"
                          type="number"
                          min="1"
                          step="1"
                          className={`${inputCls} w-24`}
                          value={form.recurringIntervalHours}
                          onChange={(e) => setForm({ ...form, recurringIntervalHours: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={createTask}
                  aria-label="タスクを作成"
                  className="text-sm px-5 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  タスクを作成
                </button>
                <button
                  onClick={() => setForm(EMPTY_FORM)}
                  aria-label="フォームをリセット"
                  className="text-sm px-5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                >
                  リセット
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Tab: Execution Logs */}
        {tab === "logs" && (
          <div id="panel-logs" role="tabpanel">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">実行ログ</h2>
                {logs.length > 0 && (
                  <button
                    onClick={exportLogsCsv}
                    aria-label="実行ログをCSVエクスポート"
                    className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  >
                    CSV出力
                  </button>
                )}
              </div>

              {logs.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  実行ログがありません。タスクを実行すると、ここにログが表示されます。
                </p>
              ) : (
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-sm" aria-label="タスク実行ログ">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">結果</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">タスク名</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">タイプ</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">開始</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">完了</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">所要時間</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">メッセージ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs
                        .sort((a, b) => b.completedAt - a.completedAt)
                        .map((log) => {
                          const typeInfo = TASK_TYPE_MAP[log.taskType];
                          return (
                            <tr key={log.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="py-2.5 pr-3">
                                {log.status === "success" ? (
                                  <span className="text-green-500" title="成功" aria-label="成功">&#10003;</span>
                                ) : (
                                  <span className="text-red-500" title="失敗" aria-label="失敗">&#10007;</span>
                                )}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-700 dark:text-gray-200 font-medium whitespace-nowrap">
                                {log.taskName}
                              </td>
                              <td className="py-2.5 pr-3">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${typeInfo?.color ?? ""}`}>
                                  {typeInfo?.icon ?? ""} {typeInfo?.label ?? log.taskType}
                                </span>
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                                {formatDateTime(log.startedAt)}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono text-xs">
                                {formatDateTime(log.completedAt)}
                              </td>
                              <td className="py-2.5 pr-3 text-gray-500 dark:text-gray-400 whitespace-nowrap text-xs">
                                {durationStr(log.startedAt, log.completedAt)}
                              </td>
                              <td className="py-2.5 text-gray-500 dark:text-gray-400 text-xs max-w-[200px] truncate" title={log.result}>
                                {log.result}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </main>
  );
}
