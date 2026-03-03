"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { getStoredOfferInteractions, getOfferInteractionsForEvent, getStoredCompanies, getStoredEvents } from "@/lib/store";
import { OfferInteraction, Company, CompanyTier, EventData } from "@/lib/types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

// --- Tier badge color map ---

const TIER_COLORS: Record<CompanyTier, string> = {
  platinum: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  gold: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  silver: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300",
  bronze: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
};

// --- Recommendation priority badge ---

type RecPriority = "改善" | "好調" | "未設定" | "データ不足";

const PRIORITY_COLORS: Record<RecPriority, string> = {
  "改善": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  "好調": "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  "未設定": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  "データ不足": "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400",
};

// --- Helpers ---

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function daysAgo(n: number): number {
  return Date.now() - n * 24 * 60 * 60 * 1000;
}

function pct(numerator: number, denominator: number): string {
  if (denominator === 0) return "0.0%";
  return (numerator / denominator * 100).toFixed(1) + "%";
}

function pctNum(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return numerator / denominator * 100;
}

function shortenName(name: string, max: number): string {
  if (name.length <= max) return name;
  return name.slice(0, max) + "...";
}

// --- CSV Export ---

function downloadOfferCsv(interactions: OfferInteraction[]): void {
  const header = "timestamp,eventId,sessionId,companyId,companyName,action,couponCode";
  const rows = interactions.map((i) => {
    const ts = new Date(i.timestamp).toISOString();
    const companyName = (i.companyName ?? "").replace(/"/g, '""');
    const coupon = (i.couponCode ?? "").replace(/"/g, '""');
    return `"${ts}","${i.eventId}","${i.sessionId}","${i.companyId}","${companyName}","${i.action}","${coupon}"`;
  });
  const csv = "\uFEFF" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `offer-analysis-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// --- Date Range Type ---

type DateRange = "today" | "7d" | "30d" | "all";

// --- Per-company stats ---

interface CompanyOfferStats {
  companyId: string;
  companyName: string;
  tier: CompanyTier;
  couponCode: string | undefined;
  offerView: number;
  offerClick: number;
  ctr: number;
  couponView: number;
  couponCopy: number;
  copyRate: number;
}

// --- Recommendation ---

interface Recommendation {
  companyName: string;
  priority: RecPriority;
  message: string;
}

// --- Page ---

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-sm dark:bg-gray-700 dark:text-gray-100";

export default function OffersPage() {
  const { status } = useSession();

  // Filter state
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange>("all");

  // Redirect if unauthenticated
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/admin";
  }, [status]);

  // All data from store
  const events = useMemo<EventData[]>(() => {
    if (status !== "authenticated") return [];
    return getStoredEvents();
  }, [status]);

  const companies = useMemo<Company[]>(() => {
    if (status !== "authenticated") return [];
    return getStoredCompanies();
  }, [status]);

  const allInteractions = useMemo<OfferInteraction[]>(() => {
    if (status !== "authenticated") return [];
    if (eventFilter === "all") {
      return getStoredOfferInteractions();
    }
    return getOfferInteractionsForEvent(eventFilter);
  }, [status, eventFilter]);

  // Apply date range filter
  const filteredInteractions = useMemo(() => {
    let result = [...allInteractions];

    if (dateRange === "today") {
      const todayStart = startOfToday();
      result = result.filter((i) => i.timestamp >= todayStart);
    } else if (dateRange === "7d") {
      const cutoff = daysAgo(7);
      result = result.filter((i) => i.timestamp >= cutoff);
    } else if (dateRange === "30d") {
      const cutoff = daysAgo(30);
      result = result.filter((i) => i.timestamp >= cutoff);
    }

    return result;
  }, [allInteractions, dateRange]);

  // --- KPI calculations ---

  const totalOfferView = useMemo(() => {
    return filteredInteractions.filter((i) => i.action === "offer_view").length;
  }, [filteredInteractions]);

  const totalOfferClick = useMemo(() => {
    return filteredInteractions.filter((i) => i.action === "offer_click").length;
  }, [filteredInteractions]);

  const totalCouponView = useMemo(() => {
    return filteredInteractions.filter((i) => i.action === "coupon_view").length;
  }, [filteredInteractions]);

  const totalCouponCopy = useMemo(() => {
    return filteredInteractions.filter((i) => i.action === "coupon_copy").length;
  }, [filteredInteractions]);

  const clickRate = useMemo(() => pct(totalOfferClick, totalOfferView), [totalOfferClick, totalOfferView]);
  const couponCopyRate = useMemo(() => pct(totalCouponCopy, totalCouponView), [totalCouponCopy, totalCouponView]);

  // --- Per-company stats ---

  const companyStats = useMemo<CompanyOfferStats[]>(() => {
    const companyMap = new Map<string, Company>();
    for (const c of companies) {
      companyMap.set(c.id, c);
    }

    // Count actions per company
    const statsMap = new Map<string, { offerView: number; offerClick: number; couponView: number; couponCopy: number }>();
    for (const i of filteredInteractions) {
      const existing = statsMap.get(i.companyId);
      if (existing) {
        if (i.action === "offer_view") existing.offerView++;
        if (i.action === "offer_click") existing.offerClick++;
        if (i.action === "coupon_view") existing.couponView++;
        if (i.action === "coupon_copy") existing.couponCopy++;
      } else {
        statsMap.set(i.companyId, {
          offerView: i.action === "offer_view" ? 1 : 0,
          offerClick: i.action === "offer_click" ? 1 : 0,
          couponView: i.action === "coupon_view" ? 1 : 0,
          couponCopy: i.action === "coupon_copy" ? 1 : 0,
        });
      }
    }

    // Build stats array including all companies (even those with no interactions)
    const result: CompanyOfferStats[] = companies.map((c) => {
      const counts = statsMap.get(c.id) ?? { offerView: 0, offerClick: 0, couponView: 0, couponCopy: 0 };
      return {
        companyId: c.id,
        companyName: c.name,
        tier: c.tier,
        couponCode: c.couponCode,
        offerView: counts.offerView,
        offerClick: counts.offerClick,
        ctr: pctNum(counts.offerClick, counts.offerView),
        couponView: counts.couponView,
        couponCopy: counts.couponCopy,
        copyRate: pctNum(counts.couponCopy, counts.couponView),
      };
    });

    // Sort by offer_view descending
    result.sort((a, b) => b.offerView - a.offerView);

    return result;
  }, [companies, filteredInteractions]);

  // --- Chart data ---

  const chartData = useMemo(() => {
    return companyStats
      .filter((s) => s.offerClick > 0 || s.couponCopy > 0)
      .map((s) => ({
        name: shortenName(s.companyName, 6),
        "オファークリック数": s.offerClick,
        "クーポンコピー数": s.couponCopy,
      }));
  }, [companyStats]);

  // --- Recommendations ---

  const recommendations = useMemo<Recommendation[]>(() => {
    const recs: Recommendation[] = [];

    for (const s of companyStats) {
      const hasAnyInteraction = s.offerView > 0 || s.offerClick > 0 || s.couponView > 0 || s.couponCopy > 0;

      if (!hasAnyInteraction) {
        recs.push({
          companyName: s.companyName,
          priority: "データ不足",
          message: "データ不足 --- イベント割当を確認",
        });
        continue;
      }

      if (s.ctr > 30) {
        recs.push({
          companyName: s.companyName,
          priority: "好調",
          message: "高パフォーマンス --- 他社モデルケースに推奨",
        });
      }

      if (s.offerView > 0 && s.offerClick === 0) {
        recs.push({
          companyName: s.companyName,
          priority: "改善",
          message: "オファー文言の改善を推奨",
        });
      }

      if (s.couponView > 0 && s.couponCopy === 0) {
        recs.push({
          companyName: s.companyName,
          priority: "改善",
          message: "クーポンコードの訴求力向上を推奨",
        });
      }

      if (!s.couponCode) {
        recs.push({
          companyName: s.companyName,
          priority: "未設定",
          message: "クーポン未設定 --- 設定でコンバージョン向上の可能性",
        });
      }
    }

    return recs;
  }, [companyStats]);

  // --- Event handlers ---

  const handleEventFilterChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setEventFilter(e.target.value);
  }, []);

  const handleDateRangeChange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  const handleExportCsv = useCallback(() => {
    downloadOfferCsv(filteredInteractions);
  }, [filteredInteractions]);

  // --- Loading State ---

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
          <p className="text-sm text-gray-400 dark:text-gray-500">オファー分析を読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="オファー分析ダッシュボード"
        badge={`${filteredInteractions.length}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
        actions={
          <button
            onClick={handleExportCsv}
            disabled={filteredInteractions.length === 0}
            aria-label="CSVエクスポート"
            className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] transition-colors"
          >
            CSV出力
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* === Filters === */}
        <Card>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            {/* Event filter */}
            <div className="w-full sm:w-56">
              <select
                value={eventFilter}
                onChange={handleEventFilterChange}
                aria-label="イベントフィルター"
                className={inputCls}
              >
                <option value="all">全イベント</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date range toggle */}
            <div className="flex gap-1">
              {([
                { range: "today" as DateRange, label: "今日" },
                { range: "7d" as DateRange, label: "7日" },
                { range: "30d" as DateRange, label: "30日" },
                { range: "all" as DateRange, label: "全期間" },
              ]).map((item) => (
                <button
                  key={item.range}
                  onClick={() => handleDateRangeChange(item.range)}
                  aria-label={`期間フィルター: ${item.label}`}
                  aria-pressed={dateRange === item.range}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    dateRange === item.range
                      ? "bg-[#6EC6FF] text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* === KPI Cards === */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "オファー表示数", value: String(totalOfferView), icon: "O", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "クリック率", value: clickRate, icon: "C", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "クーポン配布数", value: String(totalCouponView), icon: "K", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
            { label: "クーポン利用率", value: couponCopyRate, icon: "U", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg font-bold mb-2 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{s.value}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* === Per-company Performance Table === */}
        {companyStats.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              企業データがありません
            </p>
          </Card>
        ) : (
          <Card className="!p-0">
            <div className="px-6 pt-5 pb-3">
              <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">企業別オファーパフォーマンス</h2>
            </div>
            <div className="overflow-x-auto" style={{ touchAction: "pan-x" }}>
              <table className="w-full text-xs min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-600">
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">企業名</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">Tier</th>
                    <th className="text-left py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">クーポンコード</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">オファー表示</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">クリック数</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">CTR</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">クーポン表示</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">コピー数</th>
                    <th className="text-right py-3 px-4 text-gray-500 dark:text-gray-400 font-medium">コピー率</th>
                  </tr>
                </thead>
                <tbody>
                  {companyStats.map((s) => (
                    <tr
                      key={s.companyId}
                      className="border-b border-gray-50 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-4 text-gray-700 dark:text-gray-200 whitespace-nowrap font-medium">
                        {s.companyName}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap ${TIER_COLORS[s.tier]}`}>
                          {s.tier}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-500 dark:text-gray-400 font-mono">
                        {s.couponCode || <span className="text-gray-300 dark:text-gray-600">---</span>}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.offerView}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.offerClick}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.ctr.toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.couponView}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.couponCopy}
                      </td>
                      <td className="py-2.5 px-4 text-right text-gray-700 dark:text-gray-200 tabular-nums">
                        {s.copyRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* === Recharts Visualization === */}
        {chartData.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">企業別オファーパフォーマンス（グラフ）</h2>
            <div className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d1d5db" }}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d1d5db" }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "rgba(255,255,255,0.95)",
                      border: "1px solid #e5e7eb",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: "12px" }} />
                  <Bar dataKey="オファークリック数" fill="#6EC6FF" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="クーポンコピー数" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {/* === Optimization Recommendations === */}
        {recommendations.length > 0 && (
          <Card>
            <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-4">最適化レコメンデーション</h2>
            <div className="space-y-2">
              {recommendations.map((rec, idx) => (
                <div
                  key={`${rec.companyName}-${rec.priority}-${idx}`}
                  className="flex items-start gap-3 py-2 px-3 rounded-xl bg-gray-50 dark:bg-gray-800/50"
                >
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap mt-0.5 ${PRIORITY_COLORS[rec.priority]}`}>
                    {rec.priority}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-200">{rec.companyName}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{rec.message}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Empty state when no interactions at all */}
        {filteredInteractions.length === 0 && companyStats.length > 0 && (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              選択した期間・イベントのオファーインタラクションデータはまだありません
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
