"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredPurchases,
  getStoredPricingPlans,
  setStoredPricingPlans,
  getStoredEvents,
} from "@/lib/store";
import { Purchase, PricingPlan, PurchaseStatus, EventData } from "@/lib/types";
import { generateReceiptPdf } from "@/lib/receipt";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

const STATUS_LABELS: Record<PurchaseStatus, string> = {
  pending: "処理中",
  completed: "完了",
  failed: "失敗",
  refunded: "返金済",
};

const STATUS_COLORS: Record<PurchaseStatus, string> = {
  pending: "bg-yellow-100 text-yellow-700",
  completed: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  refunded: "bg-gray-100 text-gray-600",
};

function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtYen(n: number) {
  return `¥${n.toLocaleString()}`;
}

export default function PurchasesPage() {
  const { status } = useSession();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [plans, setPlans] = useState<PricingPlan[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterStatus, setFilterStatus] = useState<PurchaseStatus | "all">("all");
  const [tab, setTab] = useState<"history" | "plans">("history");
  const [sortKey, setSortKey] = useState<"date" | "amount">("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Plan editor
  const [editPlan, setEditPlan] = useState<PricingPlan | null>(null);
  const [planForm, setPlanForm] = useState({ name: "", description: "", priceYen: 0, photoCount: 0, features: "" });

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/admin";
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") return;
    setPurchases(getStoredPurchases());
    setPlans(getStoredPricingPlans());
    setEvents(getStoredEvents());
  }, [status]);

  const filtered = useMemo(() => {
    let list = [...purchases];
    if (filterEvent !== "all") list = list.filter((p) => p.eventId === filterEvent);
    if (filterStatus !== "all") list = list.filter((p) => p.status === filterStatus);
    list.sort((a, b) => {
      if (sortKey === "date") return sortAsc ? a.createdAt - b.createdAt : b.createdAt - a.createdAt;
      return sortAsc ? a.amount - b.amount : b.amount - a.amount;
    });
    return list;
  }, [purchases, filterEvent, filterStatus, sortKey, sortAsc]);

  // KPIs
  const totalRevenue = purchases.filter((p) => p.status === "completed").reduce((s, p) => s + p.amount, 0);
  const completedCount = purchases.filter((p) => p.status === "completed").length;
  const avgOrderValue = completedCount > 0 ? Math.round(totalRevenue / completedCount) : 0;
  const conversionRate = purchases.length > 0 ? Math.round((completedCount / purchases.length) * 100) : 0;

  // Chart data — daily revenue
  const dailyRevenue = useMemo(() => {
    const map: Record<string, number> = {};
    purchases
      .filter((p) => p.status === "completed")
      .forEach((p) => {
        const d = new Date(p.completedAt || p.createdAt);
        const key = `${d.getMonth() + 1}/${d.getDate()}`;
        map[key] = (map[key] || 0) + p.amount;
      });
    return Object.entries(map)
      .map(([date, amount]) => ({ date, amount }))
      .slice(-14);
  }, [purchases]);

  const handleSort = (key: "date" | "amount") => {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleEditPlan = (plan: PricingPlan) => {
    setEditPlan(plan);
    setPlanForm({
      name: plan.name,
      description: plan.description,
      priceYen: plan.priceYen,
      photoCount: plan.photoCount,
      features: plan.features.join("\n"),
    });
  };

  const handleSavePlan = () => {
    if (!editPlan || !planForm.name.trim()) return;
    const updated = plans.map((p) =>
      p.id === editPlan.id
        ? {
            ...p,
            name: planForm.name.trim(),
            description: planForm.description.trim(),
            priceYen: planForm.priceYen,
            photoCount: planForm.photoCount,
            features: planForm.features.split("\n").filter(Boolean),
          }
        : p
    );
    setStoredPricingPlans(updated);
    setPlans(updated);
    setEditPlan(null);
  };

  const handleTogglePlan = (planId: string) => {
    const updated = plans.map((p) =>
      p.id === planId ? { ...p, isActive: !p.isActive } : p
    );
    setStoredPricingPlans(updated);
    setPlans(updated);
  };

  const handleAddPlan = () => {
    const newPlan: PricingPlan = {
      id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "新規プラン",
      description: "",
      priceYen: 0,
      photoCount: 0,
      features: [],
      isActive: false,
      sortOrder: plans.length,
      createdAt: Date.now(),
    };
    const updated = [...plans, newPlan];
    setStoredPricingPlans(updated);
    setPlans(updated);
    handleEditPlan(newPlan);
  };

  const handleDeletePlan = (planId: string) => {
    const updated = plans.filter((p) => p.id !== planId);
    setStoredPricingPlans(updated);
    setPlans(updated);
    if (editPlan?.id === planId) setEditPlan(null);
  };

  const exportCsv = () => {
    const header = "ID,日時,イベント,参加者,メール,プラン,金額,状態,写真数\n";
    const rows = filtered
      .map((p) =>
        [
          p.id,
          fmtDate(p.createdAt),
          p.eventName,
          p.participantName,
          p.participantEmail,
          p.planName,
          p.amount,
          STATUS_LABELS[p.status],
          p.photoIds.length,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + header + rows], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `purchases-${Date.now()}.csv`;
    a.click();
  };

  if (status !== "authenticated") return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
        <AdminHeader
          title="決済・購入管理"
          badge={`${completedCount}件完了`}
          onLogout={() => signOut({ callbackUrl: "/admin" })}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "総売上", value: fmtYen(totalRevenue), color: "#6EC6FF" },
            { label: "完了件数", value: `${completedCount}件`, color: "#51CF66" },
            { label: "平均注文額", value: fmtYen(avgOrderValue), color: "#FFD43B" },
            { label: "決済完了率", value: `${conversionRate}%`, color: "#A78BFA" },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <p className="text-2xl font-bold" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{kpi.label}</p>
            </Card>
          ))}
        </div>

        {/* Revenue Chart */}
        {dailyRevenue.length > 0 && (
          <Card>
            <h3 className="font-bold text-gray-700 dark:text-gray-200 text-sm mb-3">日別売上推移</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyRevenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `¥${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => [`¥${Number(v).toLocaleString()}`, "売上"]} />
                  <Bar dataKey="amount" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <div className="flex gap-2" role="tablist" aria-label="購入管理タブ">
          {[
            { key: "history" as const, label: `購入履歴 (${purchases.length})` },
            { key: "plans" as const, label: `料金プラン (${plans.length})` },
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

        {/* Purchase History Tab */}
        {tab === "history" && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <select
                aria-label="イベントフィルター"
                className={inputCls + " max-w-[200px]"}
                value={filterEvent}
                onChange={(e) => setFilterEvent(e.target.value)}
              >
                <option value="all">全イベント</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
              <select
                aria-label="ステータスフィルター"
                className={inputCls + " max-w-[160px]"}
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as PurchaseStatus | "all")}
              >
                <option value="all">全ステータス</option>
                {(Object.keys(STATUS_LABELS) as PurchaseStatus[]).map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              <button
                onClick={exportCsv}
                aria-label="CSVエクスポート"
                className="text-xs px-3 py-2 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                CSV出力
              </button>
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
              <Card>
                <p className="text-sm text-gray-400 text-center py-8">購入履歴がありません</p>
              </Card>
            ) : (
              <Card>
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[700px]" aria-label="購入履歴一覧">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <th
                          className="p-2 text-left cursor-pointer hover:text-[#6EC6FF]"
                          onClick={() => handleSort("date")}
                        >
                          日時 {sortKey === "date" ? (sortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th className="p-2 text-left">イベント</th>
                        <th className="p-2 text-left">参加者</th>
                        <th className="p-2 text-left">プラン</th>
                        <th
                          className="p-2 text-right cursor-pointer hover:text-[#6EC6FF]"
                          onClick={() => handleSort("amount")}
                        >
                          金額 {sortKey === "amount" ? (sortAsc ? "↑" : "↓") : ""}
                        </th>
                        <th className="p-2 text-center">写真数</th>
                        <th className="p-2 text-center">状態</th>
                        <th className="p-2 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/50"
                        >
                          <td className="p-2 text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap">
                            {fmtDate(p.createdAt)}
                          </td>
                          <td className="p-2 font-medium text-gray-700 dark:text-gray-200">{p.eventName}</td>
                          <td className="p-2">
                            <div className="text-gray-700 dark:text-gray-200">{p.participantName}</div>
                            <div className="text-[10px] text-gray-400">{p.participantEmail}</div>
                          </td>
                          <td className="p-2 text-gray-600 dark:text-gray-300">{p.planName}</td>
                          <td className="p-2 text-right font-mono font-bold text-gray-800 dark:text-gray-100">
                            {fmtYen(p.amount)}
                          </td>
                          <td className="p-2 text-center text-gray-500">{p.photoIds.length}</td>
                          <td className="p-2 text-center">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[p.status]}`}>
                              {STATUS_LABELS[p.status]}
                            </span>
                          </td>
                          <td className="p-2 text-center">
                            {p.status === "completed" && (
                              <button
                                onClick={() => generateReceiptPdf(p)}
                                aria-label={`${p.participantName}の領収書をダウンロード`}
                                className="text-[10px] px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              >
                                領収書
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* Plans Tab */}
        {tab === "plans" && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={handleAddPlan}
                aria-label="新規プラン追加"
                className="text-xs px-3 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                + 新規プラン
              </button>
            </div>

            {/* Plan Editor */}
            {editPlan && (
              <Card>
                <h3 className="font-bold text-gray-700 dark:text-gray-200 mb-3">プラン編集</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">プラン名</label>
                    <input
                      className={inputCls}
                      aria-label="プラン名"
                      value={planForm.name}
                      onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">説明</label>
                    <input
                      className={inputCls}
                      aria-label="プラン説明"
                      value={planForm.description}
                      onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">価格 (JPY)</label>
                    <input
                      type="number"
                      className={inputCls}
                      aria-label="価格"
                      value={planForm.priceYen}
                      onChange={(e) => setPlanForm({ ...planForm, priceYen: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">写真枚数 (0=無制限)</label>
                    <input
                      type="number"
                      className={inputCls}
                      aria-label="写真枚数上限"
                      value={planForm.photoCount}
                      onChange={(e) => setPlanForm({ ...planForm, photoCount: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">特典 (1行1項目)</label>
                    <textarea
                      className={inputCls + " min-h-[80px]"}
                      aria-label="プラン特典"
                      value={planForm.features}
                      onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSavePlan}
                    className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                  >
                    保存
                  </button>
                  <button
                    onClick={() => setEditPlan(null)}
                    className="text-xs px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 font-medium transition-colors"
                  >
                    キャンセル
                  </button>
                </div>
              </Card>
            )}

            {/* Plan Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {plans
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((plan) => (
                  <Card key={plan.id}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-bold text-gray-800 dark:text-gray-100">{plan.name}</h4>
                        <p className="text-xs text-gray-400 mt-0.5">{plan.description}</p>
                      </div>
                      <button
                        onClick={() => handleTogglePlan(plan.id)}
                        aria-label={plan.isActive ? "プランを無効にする" : "プランを有効にする"}
                        className={`w-8 h-5 rounded-full transition-colors flex-shrink-0 relative focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                          plan.isActive ? "bg-green-400" : "bg-gray-300 dark:bg-gray-600"
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                            plan.isActive ? "left-3.5" : "left-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    <p className="text-2xl font-bold text-[#6EC6FF] my-3">
                      {plan.priceYen === 0 ? "無料" : fmtYen(plan.priceYen)}
                    </p>

                    <p className="text-xs text-gray-500 mb-2">
                      {plan.photoCount === 0 ? "写真無制限" : `写真${plan.photoCount}枚まで`}
                    </p>

                    {plan.features.length > 0 && (
                      <ul className="space-y-1 mb-3">
                        {plan.features.map((f, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-green-500 mt-0.5">✓</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => handleEditPlan(plan)}
                        aria-label={`${plan.name}を編集`}
                        className="text-[10px] px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDeletePlan(plan.id)}
                        aria-label={`${plan.name}を削除`}
                        className="text-[10px] px-2 py-1 rounded bg-red-50 dark:bg-red-900/30 text-red-500 dark:text-red-400 hover:bg-red-100 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                      >
                        削除
                      </button>
                    </div>
                  </Card>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
