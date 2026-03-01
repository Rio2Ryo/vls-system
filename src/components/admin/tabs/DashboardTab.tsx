"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { AnalyticsRecord, Company, CompanyTier, EventData, VideoPlayRecord } from "@/lib/types";
import {
  getStoredEvents, getStoredCompanies, getStoredAnalytics, getStoredVideoPlays,
  clearAnalytics, getStoredSurvey,
  getEventsForTenant, getAnalyticsForTenant, getVideoPlaysForTenant,
} from "@/lib/store";
import { IS_DEMO_MODE } from "@/lib/demo";
import { exportSurveyCsv, exportEventStatsCsv } from "./adminUtils";

interface Props {
  tenantId?: string | null;
}

export default function DashboardTab({ tenantId }: Props) {
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [selectedEventFilter, setSelectedEventFilter] = useState<string>("all");

  useEffect(() => {
    setEvents(tenantId ? getEventsForTenant(tenantId) : getStoredEvents());
    setCompanies(getStoredCompanies());
    setAnalytics(tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics());
    setVideoPlays(tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays());
  }, [tenantId]);

  const filteredAnalytics = selectedEventFilter === "all"
    ? analytics
    : analytics.filter((r) => r.eventId === selectedEventFilter);

  const funnel = {
    access: filteredAnalytics.filter((r) => r.stepsCompleted.access).length,
    survey: filteredAnalytics.filter((r) => r.stepsCompleted.survey).length,
    cmViewed: filteredAnalytics.filter((r) => r.stepsCompleted.cmViewed).length,
    photosViewed: filteredAnalytics.filter((r) => r.stepsCompleted.photosViewed).length,
    downloaded: filteredAnalytics.filter((r) => r.stepsCompleted.downloaded).length,
  };

  const surveyQuestions = getStoredSurvey();
  const answeredRecords = filteredAnalytics.filter((r) => r.surveyAnswers);
  const surveyAgg: Record<string, Record<string, number>> = {};
  for (const q of surveyQuestions) {
    surveyAgg[q.id] = {};
    for (const opt of q.options) {
      surveyAgg[q.id][opt.tag] = 0;
    }
  }
  for (const record of answeredRecords) {
    if (!record.surveyAnswers) continue;
    for (const [qId, tags] of Object.entries(record.surveyAnswers)) {
      if (!surveyAgg[qId]) continue;
      for (const tag of tags) {
        surveyAgg[qId][tag] = (surveyAgg[qId][tag] || 0) + 1;
      }
    }
  }

  const cmViewCounts: Record<string, { matched: number; platinum: number }> = {};
  for (const c of companies) {
    cmViewCounts[c.id] = { matched: 0, platinum: 0 };
  }
  for (const record of filteredAnalytics) {
    if (record.matchedCompanyId && cmViewCounts[record.matchedCompanyId]) {
      cmViewCounts[record.matchedCompanyId].matched++;
    }
    if (record.platinumCompanyId && cmViewCounts[record.platinumCompanyId]) {
      cmViewCounts[record.platinumCompanyId].platinum++;
    }
  }

  const eventStats = events.map((evt) => {
    const evtRecords = analytics.filter((r) => r.eventId === evt.id);
    const evtPlays = videoPlays.filter((p) => p.eventId === evt.id);
    const accessCount = evtRecords.filter((r) => r.stepsCompleted.access).length;
    const dlCount = evtRecords.filter((r) => r.stepsCompleted.downloaded).length;
    const cmPlayCount = evtPlays.length;
    const cmCompletedCount = evtPlays.filter((p) => p.completed).length;
    return {
      event: evt,
      access: accessCount,
      completed: dlCount,
      completionRate: accessCount > 0 ? Math.round((dlCount / accessCount) * 100) : 0,
      cmPlays: cmPlayCount,
      cmCompleted: cmCompletedCount,
      cmCompletionRate: cmPlayCount > 0 ? Math.round((cmCompletedCount / cmPlayCount) * 100) : 0,
    };
  });

  const handleClearAnalytics = () => {
    clearAnalytics();
    setAnalytics([]);
  };

  const funnelSteps = [
    { key: "access", label: "アクセス", count: funnel.access, color: "bg-blue-400" },
    { key: "survey", label: "アンケート完了", count: funnel.survey, color: "bg-green-400" },
    { key: "cmViewed", label: "CM視聴完了", count: funnel.cmViewed, color: "bg-yellow-400" },
    { key: "photosViewed", label: "写真閲覧", count: funnel.photosViewed, color: "bg-pink-400" },
    { key: "downloaded", label: "DL完了", count: funnel.downloaded, color: "bg-purple-400" },
  ];
  const maxFunnel = Math.max(funnel.access, 1);

  return (
    <div className="space-y-6" data-testid="dashboard-tab-content">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "総アクセス数", value: String(analytics.length), icon: "👥", color: "bg-blue-50 text-blue-600" },
          { label: "登録イベント", value: String(events.length), icon: "🎪", color: "bg-yellow-50 text-yellow-700" },
          { label: "パートナー企業", value: String(companies.length), icon: "🏢", color: "bg-pink-50 text-pink-600" },
          { label: "DL完了率", value: analytics.length > 0 ? `${Math.round((funnel.downloaded / analytics.length) * 100)}%` : "—", icon: "📊", color: "bg-green-50 text-green-600" },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg mb-2 ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </Card>
        ))}
      </div>

      {/* Stats CSV Export */}
      <Card>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-gray-700">統計CSVエクスポート</h3>
            <p className="text-xs text-gray-400 mt-0.5">イベント別のDL数・CM視聴完了率を含む統計データ</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => exportEventStatsCsv(events, analytics, videoPlays, companies)}
              aria-label="イベント統計をCSVエクスポート"
              className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
              data-testid="stats-csv-export-btn"
            >
              イベント統計CSV
            </button>
            {analytics.filter((r) => r.surveyAnswers).length > 0 && (
              <button
                onClick={() => exportSurveyCsv(analytics.filter((r) => r.surveyAnswers), getStoredSurvey(), events)}
                aria-label="アンケート回答をCSVエクスポート"
                className="text-xs px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                data-testid="survey-csv-export-btn"
              >
                アンケート回答CSV
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Event filter */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-700">アクセス・完了ファネル</h3>
          <div className="flex items-center gap-2">
            <select
              value={selectedEventFilter}
              onChange={(e) => setSelectedEventFilter(e.target.value)}
              aria-label="イベントで絞り込み"
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 focus:outline-none focus:border-[#6EC6FF] focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              data-testid="dashboard-event-filter"
            >
              <option value="all">全イベント</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.name}</option>
              ))}
            </select>
            {!IS_DEMO_MODE && !tenantId && (
              <button
                onClick={handleClearAnalytics}
                aria-label="アクセスデータをクリア"
                className="text-[10px] text-red-400 hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
              >
                データクリア
              </button>
            )}
          </div>
        </div>

        {analytics.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">まだアクセスデータがありません</p>
        ) : (
          <div className="space-y-3">
            {funnelSteps.map((step) => (
              <div key={step.key} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-28 text-right flex-shrink-0">{step.label}</span>
                <div
                  className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden"
                  role="meter"
                  aria-label={step.label}
                  aria-valuenow={step.count}
                  aria-valuemin={0}
                  aria-valuemax={maxFunnel}
                >
                  <div
                    className={`h-full rounded-full ${step.color} transition-all duration-500`}
                    style={{ width: `${(step.count / maxFunnel) * 100}%` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                    {step.count}
                  </span>
                </div>
                <span className="text-xs text-gray-400 w-12 flex-shrink-0">
                  {funnel.access > 0 ? `${Math.round((step.count / funnel.access) * 100)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Per-event stats table */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">イベント別アクセス統計</h3>
        {eventStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">イベントが登録されていません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]" data-testid="event-stats-table">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500 font-medium">イベント名</th>
                  <th className="text-center py-2 text-gray-500 font-medium">アクセス</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL完了</th>
                  <th className="text-center py-2 text-gray-500 font-medium">DL率</th>
                  <th className="text-center py-2 text-gray-500 font-medium">CM再生</th>
                  <th className="text-center py-2 text-gray-500 font-medium">CM完了率</th>
                </tr>
              </thead>
              <tbody>
                {eventStats.map((es) => (
                  <tr key={es.event.id} className="border-b border-gray-50">
                    <td className="py-2 text-gray-700">{es.event.name}</td>
                    <td className="py-2 text-center font-mono">{es.access}</td>
                    <td className="py-2 text-center font-mono">{es.completed}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        es.completionRate >= 70 ? "bg-green-50 text-green-600" :
                        es.completionRate >= 40 ? "bg-yellow-50 text-yellow-600" :
                        "bg-gray-50 text-gray-500"
                      }`}>
                        {es.access > 0 ? `${es.completionRate}%` : "—"}
                      </span>
                    </td>
                    <td className="py-2 text-center font-mono">{es.cmPlays}</td>
                    <td className="py-2 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        es.cmCompletionRate >= 70 ? "bg-green-50 text-green-600" :
                        es.cmCompletionRate >= 40 ? "bg-yellow-50 text-yellow-600" :
                        "bg-gray-50 text-gray-500"
                      }`}>
                        {es.cmPlays > 0 ? `${es.cmCompletionRate}%` : "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Survey results aggregation */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-gray-700">アンケート集計結果</h3>
          {answeredRecords.length > 0 && (
            <button
              onClick={() => exportSurveyCsv(answeredRecords, surveyQuestions, events)}
              className="text-xs px-3 py-1.5 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium transition-colors"
              data-testid="csv-export-btn"
            >
              CSVエクスポート
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mb-4">回答数: {answeredRecords.length}件</p>

        {answeredRecords.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">まだ回答データがありません</p>
        ) : (
          <div className="space-y-6">
            {surveyQuestions.map((q) => {
              const qData = surveyAgg[q.id] || {};
              const maxCount = Math.max(...Object.values(qData), 1);
              return (
                <div key={q.id} data-testid={`survey-result-${q.id}`}>
                  <p className="text-sm font-bold text-gray-600 mb-2">{q.question}</p>
                  <div className="space-y-1.5">
                    {q.options.map((opt) => {
                      const count = qData[opt.tag] || 0;
                      const pct = answeredRecords.length > 0 ? Math.round((count / answeredRecords.length) * 100) : 0;
                      return (
                        <div key={opt.tag} className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0">{opt.label}</span>
                          <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#6EC6FF] transition-all duration-500"
                              style={{ width: `${maxCount > 0 ? (count / maxCount) * 100 : 0}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-600">
                              {count > 0 ? `${count}件 (${pct}%)` : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* CM view stats — grouped by tier */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">CM表示回数（企業別）</h3>
          <div className="flex flex-wrap gap-2 text-[10px]">
            {(["platinum", "gold", "silver", "bronze"] as const).map((t) => {
              const count = companies.filter((c) => c.tier === t).length;
              const tierColors: Record<string, string> = { platinum: "bg-blue-100 text-blue-700", gold: "bg-yellow-100 text-yellow-700", silver: "bg-gray-100 text-gray-600", bronze: "bg-orange-100 text-orange-700" };
              return <span key={t} className={`px-2 py-0.5 rounded-full font-bold uppercase ${tierColors[t]}`}>{t} ({count})</span>;
            })}
          </div>
        </div>
        {companies.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">企業が登録されていません</p>
        ) : (
          <div className="space-y-4">
            {(["platinum", "gold", "silver", "bronze"] as CompanyTier[]).map((tier) => {
              const tierCompanies = companies
                .filter((c) => c.tier === tier)
                .sort((a, b) => {
                  const aTotal = (cmViewCounts[a.id]?.matched || 0) + (cmViewCounts[a.id]?.platinum || 0);
                  const bTotal = (cmViewCounts[b.id]?.matched || 0) + (cmViewCounts[b.id]?.platinum || 0);
                  return bTotal - aTotal;
                });
              if (tierCompanies.length === 0) return null;
              const tierLabels: Record<string, string> = { platinum: "Platinum", gold: "Gold", silver: "Silver", bronze: "Bronze" };
              const tierBg: Record<string, string> = { platinum: "border-l-blue-400", gold: "border-l-yellow-400", silver: "border-l-gray-400", bronze: "border-l-orange-400" };
              return (
                <div key={tier} className={`border-l-4 ${tierBg[tier]} pl-3`}>
                  <p className="text-xs font-bold text-gray-500 uppercase mb-2">{tierLabels[tier]} ({tierCompanies.length}社)</p>
                  <div className="space-y-2">
                    {tierCompanies.map((c) => {
                      const views = cmViewCounts[c.id] || { matched: 0, platinum: 0 };
                      const total = views.matched + views.platinum;
                      return (
                        <div key={c.id} className="flex items-center gap-3" data-testid={`cm-stats-${c.id}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm text-gray-600 truncate block">{c.name}</span>
                            <div className="flex gap-3 text-xs">
                              <span className="text-blue-500">提供CM: <b>{views.platinum}</b></span>
                              <span className="text-green-500">マッチCM: <b>{views.matched}</b></span>
                              <span className="text-gray-400">計: <b>{total}</b></span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
