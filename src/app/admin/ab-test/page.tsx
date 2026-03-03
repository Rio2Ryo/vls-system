"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredABTests, addABTest, updateABTest, getABTestsForTenant,
  getStoredCompanies, getStoredEvents, getEventsForTenant,
} from "@/lib/store";
import { ABTest, ABVariant, Company, EventData } from "@/lib/types";
import { calcSignificance } from "@/lib/abtest";
import { logAudit } from "@/lib/audit";

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

const STATUS_BADGE: Record<ABTest["status"], string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  completed: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
};

const STATUS_LABEL: Record<ABTest["status"], string> = {
  active: "実行中",
  paused: "一時停止",
  completed: "完了",
};

const VARIANT_DEFS: { cmType: ABVariant["cmType"]; label: string }[] = [
  { cmType: "cm15", label: "15秒CM" },
  { cmType: "cm30", label: "30秒CM" },
  { cmType: "cm60", label: "60秒CM" },
];

const CHART_COLORS = {
  completion: "#3B82F6",
  conversion: "#10B981",
};

const DARK_TOOLTIP_STYLE = {
  backgroundColor: "#1F2937",
  border: "1px solid #374151",
  borderRadius: "12px",
  color: "#F3F4F6",
  fontSize: "12px",
};

const MIN_SAMPLE_SIZE = 30;

export default function ABTestPage() {
  const { data: session, status } = useSession();

  const [tests, setTests] = useState<ABTest[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [expandedTestId, setExpandedTestId] = useState<string | null>(null);
  const [toast, setToast] = useState("");

  // Create form state
  const [testName, setTestName] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [selectedCmTypes, setSelectedCmTypes] = useState<Set<ABVariant["cmType"]>>(new Set());
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [allEvents, setAllEvents] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const tenantId = session?.user?.tenantId
    ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null)
    ?? null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }, []);

  const reload = useCallback(() => {
    if (status !== "authenticated") return;
    setCompanies(getStoredCompanies());
    if (tenantId) {
      setTests(getABTestsForTenant(tenantId));
      setEvents(getEventsForTenant(tenantId));
    } else {
      setTests(getStoredABTests());
      setEvents(getStoredEvents());
    }
  }, [status, tenantId]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/admin";
    }
  }, [status]);

  // --- Handlers ---

  const toggleCmType = useCallback((cmType: ABVariant["cmType"]) => {
    setSelectedCmTypes((prev) => {
      const next = new Set(prev);
      if (next.has(cmType)) {
        next.delete(cmType);
      } else {
        next.add(cmType);
      }
      return next;
    });
  }, []);

  const toggleEventId = useCallback((eventId: string) => {
    setSelectedEventIds((prev) =>
      prev.includes(eventId)
        ? prev.filter((id) => id !== eventId)
        : [...prev, eventId]
    );
  }, []);

  const handleCreate = useCallback(() => {
    if (!testName.trim()) return;
    if (!selectedCompanyId) return;
    if (selectedCmTypes.size < 2) return;

    const company = companies.find((c) => c.id === selectedCompanyId);
    if (!company) return;

    const variants: ABVariant[] = Array.from(selectedCmTypes).map((cmType) => {
      const def = VARIANT_DEFS.find((d) => d.cmType === cmType);
      return {
        id: `var-${cmType}`,
        label: def?.label ?? cmType,
        cmType,
        impressions: 0,
        completions: 0,
        conversions: 0,
      };
    });

    const newTest: ABTest = {
      id: `ab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: testName.trim(),
      companyId: company.id,
      companyName: company.name,
      variants,
      status: "active",
      createdAt: Date.now(),
      eventIds: allEvents ? undefined : selectedEventIds.length > 0 ? selectedEventIds : undefined,
      tenantId: tenantId || undefined,
    };

    addABTest(newTest);
    logAudit("settings_update", { type: "ab_test", name: testName.trim() });

    // Reset form
    setTestName("");
    setSelectedCompanyId("");
    setSelectedCmTypes(new Set());
    setSelectedEventIds([]);
    setAllEvents(true);
    setShowCreateForm(false);
    reload();
    showToast("A/Bテストを作成しました");
  }, [testName, selectedCompanyId, selectedCmTypes, allEvents, selectedEventIds, companies, tenantId, reload, showToast]);

  const handleStatusChange = useCallback((testId: string, newStatus: ABTest["status"]) => {
    const update: Partial<ABTest> = { status: newStatus };
    if (newStatus === "completed") {
      update.completedAt = Date.now();
    }
    updateABTest(testId, update);
    reload();
    showToast(
      newStatus === "paused" ? "テストを一時停止しました" :
      newStatus === "active" ? "テストを再開しました" :
      "テストを完了しました"
    );
  }, [reload, showToast]);

  const toggleExpand = useCallback((testId: string) => {
    setExpandedTestId((prev) => (prev === testId ? null : testId));
  }, []);

  const canCreate = useMemo(() => {
    return testName.trim().length > 0 && selectedCompanyId.length > 0 && selectedCmTypes.size >= 2;
  }, [testName, selectedCompanyId, selectedCmTypes]);

  // --- Loading / Unauthenticated guard ---

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
          <p className="text-sm text-gray-400 dark:text-gray-500">A/Bテスト管理を読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="A/Bテスト管理"
        badge={`${tests.length}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        {toast && (
          <div
            className="px-4 py-2 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm text-center"
            role="status"
            aria-live="polite"
          >
            {toast}
          </div>
        )}

        {/* Header row */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">テスト一覧</h2>
          <button
            onClick={() => setShowCreateForm((prev) => !prev)}
            aria-label={showCreateForm ? "新規テスト作成を閉じる" : "新規テスト作成を開く"}
            className="text-sm px-4 py-2 rounded-xl bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
          >
            {showCreateForm ? "フォームを閉じる" : "+ 新規テスト作成"}
          </button>
        </div>

        {/* Create form */}
        {showCreateForm && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-4">新規A/Bテスト作成</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Test name */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                  テスト名 *
                </label>
                <input
                  className={inputCls}
                  placeholder="例: CM尺比較テスト A社"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  aria-label="テスト名"
                />
              </div>

              {/* Company select */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">
                  対象企業 *
                </label>
                <select
                  className={inputCls}
                  value={selectedCompanyId}
                  onChange={(e) => setSelectedCompanyId(e.target.value)}
                  aria-label="対象企業を選択"
                >
                  <option value="">企業を選択...</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.tier})</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Variant checkboxes */}
            <div className="mt-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 block">
                バリアント選択 * (2つ以上選択)
              </label>
              <div className="flex flex-wrap gap-3">
                {VARIANT_DEFS.map((def) => (
                  <label
                    key={def.cmType}
                    className="flex items-center gap-2 cursor-pointer text-sm bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-4 py-2 rounded-xl hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedCmTypes.has(def.cmType)}
                      onChange={() => toggleCmType(def.cmType)}
                      className="rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF] w-4 h-4"
                      aria-label={`${def.label}を選択`}
                    />
                    <span className="text-gray-700 dark:text-gray-300">{def.label}</span>
                  </label>
                ))}
              </div>
              {selectedCmTypes.size === 1 && (
                <p className="text-xs text-orange-500 mt-1">2つ以上のバリアントを選択してください</p>
              )}
            </div>

            {/* Event selection */}
            <div className="mt-4">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2 block">
                対象イベント
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sm mb-2">
                <input
                  type="checkbox"
                  checked={allEvents}
                  onChange={(e) => setAllEvents(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF] w-4 h-4"
                  aria-label="全イベントを対象にする"
                />
                <span className="text-gray-700 dark:text-gray-300">全イベント</span>
              </label>
              {!allEvents && (
                <div className="flex flex-wrap gap-2 mt-1">
                  {events.map((evt) => (
                    <label
                      key={evt.id}
                      className="flex items-center gap-1.5 cursor-pointer text-xs bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 px-3 py-1.5 rounded-full hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedEventIds.includes(evt.id)}
                        onChange={() => toggleEventId(evt.id)}
                        className="rounded border-gray-300 dark:border-gray-600 text-[#6EC6FF] focus:ring-[#6EC6FF] w-3.5 h-3.5"
                        aria-label={`${evt.name}を対象に含める`}
                      />
                      <span className="text-gray-600 dark:text-gray-300">{evt.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Submit */}
            <div className="flex gap-2 mt-5">
              <button
                onClick={handleCreate}
                disabled={!canCreate}
                aria-label="テストを作成"
                className={`text-sm px-4 py-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  canCreate
                    ? "bg-[#6EC6FF] text-white hover:bg-blue-400"
                    : "bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                }`}
              >
                作成
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                aria-label="キャンセル"
                className="text-sm px-4 py-2 rounded-xl font-medium border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                キャンセル
              </button>
            </div>
          </Card>
        )}

        {/* Empty state */}
        {tests.length === 0 && !showCreateForm && (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              A/Bテストはまだありません
            </p>
          </Card>
        )}

        {/* Test list */}
        {tests.length > 0 && (
          <div className="space-y-4">
            {tests.map((test) => (
              <TestCard
                key={test.id}
                test={test}
                expanded={expandedTestId === test.id}
                onToggleExpand={() => toggleExpand(test.id)}
                onStatusChange={handleStatusChange}
                companies={companies}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

// --- Test Card Component ---

interface TestCardProps {
  test: ABTest;
  expanded: boolean;
  onToggleExpand: () => void;
  onStatusChange: (testId: string, status: ABTest["status"]) => void;
  companies: Company[];
}

function TestCard({ test, expanded, onToggleExpand, onStatusChange, companies }: TestCardProps) {
  const significance = useMemo(() => calcSignificance(test.variants), [test.variants]);

  const chartData = useMemo(() => {
    return test.variants.map((v) => ({
      name: v.label,
      completionRate: v.impressions > 0 ? Math.round((v.completions / v.impressions) * 1000) / 10 : 0,
      conversionRate: v.impressions > 0 ? Math.round((v.conversions / v.impressions) * 1000) / 10 : 0,
      variantId: v.id,
    }));
  }, [test.variants]);

  const totalImpressions = useMemo(
    () => test.variants.reduce((s, v) => s + v.impressions, 0),
    [test.variants]
  );

  const company = useMemo(
    () => companies.find((c) => c.id === test.companyId),
    [companies, test.companyId]
  );

  return (
    <Card>
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-gray-700 dark:text-gray-200">{test.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${STATUS_BADGE[test.status]}`}>
              {STATUS_LABEL[test.status]}
            </span>
            {significance.significant && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                有意差あり
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 dark:text-gray-500">
            <span>企業: {test.companyName}{company ? ` (${company.tier})` : ""}</span>
            <span>作成: {new Date(test.createdAt).toLocaleDateString("ja-JP")}</span>
            {test.completedAt && (
              <span>完了: {new Date(test.completedAt).toLocaleDateString("ja-JP")}</span>
            )}
            <span>合計表示: {totalImpressions}回</span>
          </div>

          {/* Variant summary badges */}
          <div className="flex gap-2 mt-2 flex-wrap">
            {test.variants.map((v) => (
              <span
                key={v.id}
                className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                  significance.winner === v.id
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 ring-1 ring-green-300 dark:ring-green-600"
                    : "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                }`}
              >
                {v.label}: {v.impressions}表示 / {v.completions}完了
              </span>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0 ml-4">
          {/* Status action buttons */}
          {test.status === "active" && (
            <>
              <button
                onClick={() => onStatusChange(test.id, "paused")}
                aria-label={`${test.name}を一時停止`}
                className="text-xs text-yellow-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 rounded"
              >
                停止
              </button>
              <button
                onClick={() => onStatusChange(test.id, "completed")}
                aria-label={`${test.name}を完了にする`}
                className="text-xs text-gray-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
              >
                完了
              </button>
            </>
          )}
          {test.status === "paused" && (
            <>
              <button
                onClick={() => onStatusChange(test.id, "active")}
                aria-label={`${test.name}を再開`}
                className="text-xs text-green-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400 rounded"
              >
                再開
              </button>
              <button
                onClick={() => onStatusChange(test.id, "completed")}
                aria-label={`${test.name}を完了にする`}
                className="text-xs text-gray-500 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded"
              >
                完了
              </button>
            </>
          )}
          <button
            onClick={onToggleExpand}
            aria-label={expanded ? `${test.name}の詳細を閉じる` : `${test.name}の詳細を開く`}
            aria-expanded={expanded}
            className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            {expanded ? "閉じる" : "詳細"}
          </button>
        </div>
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-6">
          {/* Bar chart */}
          <div>
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-3">バリアント比較チャート</h4>
            {totalImpressions === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-4">
                まだデータがありません
              </p>
            ) : (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.3} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} stroke="#9CA3AF" />
                    <YAxis tick={{ fontSize: 12 }} stroke="#9CA3AF" unit="%" />
                    <Tooltip
                      contentStyle={DARK_TOOLTIP_STYLE}
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      formatter={(value: any) => [`${value}%`]}
                    />
                    <Legend wrapperStyle={{ fontSize: "12px" }} />
                    <Bar dataKey="completionRate" name="完了率" fill={CHART_COLORS.completion} radius={[4, 4, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.variantId}
                          fill={significance.winner === entry.variantId ? "#2563EB" : CHART_COLORS.completion}
                        />
                      ))}
                    </Bar>
                    <Bar dataKey="conversionRate" name="CVR" fill={CHART_COLORS.conversion} radius={[4, 4, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell
                          key={entry.variantId}
                          fill={significance.winner === entry.variantId ? "#059669" : CHART_COLORS.conversion}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Results table */}
          <div>
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-3">結果テーブル</h4>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm" aria-label="A/Bテスト結果">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">バリアント</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">表示回数</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">完了数</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">完了率</th>
                    <th className="text-right py-2 px-3 text-xs font-bold text-gray-500 dark:text-gray-400">CVR</th>
                  </tr>
                </thead>
                <tbody>
                  {test.variants.map((v) => {
                    const completionRate = v.impressions > 0
                      ? (v.completions / v.impressions * 100).toFixed(1)
                      : "0.0";
                    const cvr = v.impressions > 0
                      ? (v.conversions / v.impressions * 100).toFixed(1)
                      : "0.0";
                    const isWinner = significance.winner === v.id;
                    return (
                      <tr
                        key={v.id}
                        className={`border-b border-gray-100 dark:border-gray-700 ${
                          isWinner ? "bg-green-50 dark:bg-green-900/10" : ""
                        }`}
                      >
                        <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                          {v.label}
                          {isWinner && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 font-bold">
                              WINNER
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 tabular-nums">{v.impressions.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 tabular-nums">{v.completions.toLocaleString()}</td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 tabular-nums">{completionRate}%</td>
                        <td className="py-2 px-3 text-right text-gray-600 dark:text-gray-400 tabular-nums">{cvr}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Statistical significance */}
          <div>
            <h4 className="text-sm font-bold text-gray-600 dark:text-gray-300 mb-3">統計的有意性</h4>
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap gap-4 text-xs">
                <div>
                  <span className="text-gray-400 dark:text-gray-500">Chi-squared (χ²): </span>
                  <span className="font-mono text-gray-700 dark:text-gray-300">{significance.chiSquared}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">自由度 (df): </span>
                  <span className="font-mono text-gray-700 dark:text-gray-300">{significance.degreesOfFreedom}</span>
                </div>
                <div>
                  <span className="text-gray-400 dark:text-gray-500">p値: </span>
                  <span className="font-mono text-gray-700 dark:text-gray-300">{significance.pValue}</span>
                </div>
              </div>

              {/* Significance badge */}
              <div className="flex items-center gap-2 flex-wrap">
                {significance.significant ? (
                  <span className="text-xs px-3 py-1 rounded-full font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                    有意差あり &#x2713;
                  </span>
                ) : (
                  <span className="text-xs px-3 py-1 rounded-full font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                    有意差なし
                  </span>
                )}
                {!significance.significant && totalImpressions < MIN_SAMPLE_SIZE * test.variants.length && (
                  <span className="text-xs text-orange-500 dark:text-orange-400">
                    データ不足 (各バリアント{MIN_SAMPLE_SIZE}表示以上が推奨)
                  </span>
                )}
                {significance.significant && significance.winner && (
                  <span className="text-xs text-green-600 dark:text-green-400">
                    勝者: {test.variants.find((v) => v.id === significance.winner)?.label ?? significance.winner}
                  </span>
                )}
              </div>

              {/* Minimum sample size progress */}
              <div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                  最小サンプル数 (バリアントごとに{MIN_SAMPLE_SIZE}表示)
                </p>
                <div className="space-y-1.5">
                  {test.variants.map((v) => {
                    const progress = Math.min(100, Math.round((v.impressions / MIN_SAMPLE_SIZE) * 100));
                    return (
                      <div key={v.id} className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 w-16 flex-shrink-0">{v.label}</span>
                        <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${v.label}のサンプル進捗`}>
                          <div
                            className={`h-2 rounded-full transition-all ${
                              progress >= 100 ? "bg-green-500" : "bg-[#6EC6FF]"
                            }`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 w-20 text-right flex-shrink-0">
                          {v.impressions}/{MIN_SAMPLE_SIZE} ({progress}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
