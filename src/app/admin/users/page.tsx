"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredAnalytics, getStoredEvents, getStoredCompanies,
  getStoredVideoPlays, getStoredSurvey, getSurveyForEvent,
} from "@/lib/store";
import {
  AnalyticsRecord, EventData, Company, VideoPlayRecord,
  SurveyQuestion, InterestTag,
} from "@/lib/types";
import { IS_DEMO_MODE } from "@/lib/demo";

const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-sm bg-white dark:bg-gray-700 dark:text-gray-100";

// Score config
const SCORE_WEIGHTS = { survey: 20, cmViewed: 30, photosViewed: 20, downloaded: 30 };
const SESSION_WINDOW_MS = 60 * 60 * 1000; // 1 hour window to link video plays to session

interface UserSession {
  record: AnalyticsRecord;
  event?: EventData;
  matchedCompany?: Company;
  platinumCompany?: Company;
  videoPlays: VideoPlayRecord[];
  cmScore: number;
  stepScore: number;
}

function calcStepScore(r: AnalyticsRecord): number {
  let s = 0;
  if (r.stepsCompleted.survey) s += SCORE_WEIGHTS.survey;
  if (r.stepsCompleted.cmViewed) s += SCORE_WEIGHTS.cmViewed;
  if (r.stepsCompleted.photosViewed) s += SCORE_WEIGHTS.photosViewed;
  if (r.stepsCompleted.downloaded) s += SCORE_WEIGHTS.downloaded;
  return s;
}

function calcCmScore(plays: VideoPlayRecord[]): number {
  if (plays.length === 0) return 0;
  const completedCount = plays.filter((p) => p.completed).length;
  const completionRate = completedCount / plays.length;
  const totalWatched = plays.reduce((s, p) => s + p.watchedSeconds, 0);
  const totalExpected = plays.reduce((s, p) => s + p.duration, 0);
  const watchRate = totalExpected > 0 ? totalWatched / totalExpected : 0;
  return Math.round(((completionRate * 0.6 + watchRate * 0.4) * 100));
}

type SortKey = "date-desc" | "date-asc" | "name-asc" | "score-desc" | "score-asc";

export default function UsersPage() {
  const { data: session, status } = useSession();

  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [, setGlobalSurvey] = useState<SurveyQuestion[]>([]);

  const [filterEvent, setFilterEvent] = useState("all");
  const [filterText, setFilterText] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date-desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const tenantId = session?.user?.tenantId ?? (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ?? null;

  const reload = useCallback(() => {
    if (tenantId) {
      const tenantEvents = getStoredEvents().filter((e) => e.tenantId === tenantId);
      const tenantEventIds = new Set(tenantEvents.map((e) => e.id));
      setEvents(tenantEvents);
      setAnalytics(getStoredAnalytics().filter((a) => tenantEventIds.has(a.eventId)));
      setVideoPlays(getStoredVideoPlays().filter((v) => tenantEventIds.has(v.eventId)));
    } else {
      setAnalytics(getStoredAnalytics());
      setEvents(getStoredEvents());
      setVideoPlays(getStoredVideoPlays());
    }
    setCompanies(getStoredCompanies());
    setGlobalSurvey(getStoredSurvey());
  }, [tenantId]);

  useEffect(() => { if (status === "authenticated") reload(); }, [status, reload]);

  // Build user sessions by joining analytics + video plays
  const sessions: UserSession[] = useMemo(() => {
    return analytics.map((r) => {
      const event = events.find((e) => e.id === r.eventId);
      const matchedCompany = r.matchedCompanyId ? companies.find((c) => c.id === r.matchedCompanyId) : undefined;
      const platinumCompany = r.platinumCompanyId ? companies.find((c) => c.id === r.platinumCompanyId) : undefined;

      // Link video plays by eventId + timestamp proximity
      const plays = videoPlays.filter((vp) =>
        vp.eventId === r.eventId &&
        Math.abs(vp.timestamp - r.timestamp) < SESSION_WINDOW_MS
      );

      const stepScore = calcStepScore(r);
      const cmScore = calcCmScore(plays);

      return { record: r, event, matchedCompany, platinumCompany, videoPlays: plays, cmScore, stepScore };
    });
  }, [analytics, events, companies, videoPlays]);

  // Filter & sort
  const filtered = useMemo(() => {
    let result = sessions;
    if (filterEvent !== "all") result = result.filter((s) => s.record.eventId === filterEvent);
    if (filterText) {
      const q = filterText.toLowerCase();
      result = result.filter((s) =>
        (s.record.respondentName || "").toLowerCase().includes(q) ||
        (s.event?.name || "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [sessions, filterEvent, filterText]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "date-desc": return b.record.timestamp - a.record.timestamp;
        case "date-asc": return a.record.timestamp - b.record.timestamp;
        case "name-asc": return (a.record.respondentName || "").localeCompare(b.record.respondentName || "", "ja");
        case "score-desc": return (b.stepScore + b.cmScore) - (a.stepScore + a.cmScore);
        case "score-asc": return (a.stepScore + a.cmScore) - (b.stepScore + b.cmScore);
        default: return 0;
      }
    });
  }, [filtered, sortKey]);

  // Stats
  const stats = useMemo(() => {
    const total = filtered.length;
    const named = filtered.filter((s) => s.record.respondentName).length;
    const downloaded = filtered.filter((s) => s.record.stepsCompleted.downloaded).length;
    const avgScore = total > 0 ? Math.round(filtered.reduce((s, u) => s + u.stepScore + u.cmScore, 0) / total) : 0;
    return { total, named, downloaded, avgScore };
  }, [filtered]);

  const getSurveyQuestions = (eventId: string): SurveyQuestion[] => {
    return getSurveyForEvent(eventId);
  };

  const getTagLabel = (tag: InterestTag, questions: SurveyQuestion[]): string => {
    for (const q of questions) {
      const opt = q.options.find((o) => o.tag === tag);
      if (opt) return opt.label;
    }
    return tag;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const ScoreBadge = ({ score, max, label }: { score: number; max: number; label: string }) => {
    const pct = max > 0 ? Math.round((score / max) * 100) : 0;
    const color = pct >= 80 ? "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/30" : pct >= 50 ? "text-yellow-600 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-900/30" : "text-red-500 bg-red-50 dark:text-red-400 dark:bg-red-900/30";
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${color}`}>
        {label} {score}/{max}
      </span>
    );
  };

  const StepDot = ({ done, label }: { done: boolean; label: string }) => (
    <span className={`text-[10px] px-1.5 py-0.5 rounded ${done ? "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-gray-50 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
      {done ? "✓" : "○"} {label}
    </span>
  );

  const CM_TYPE_LABELS: Record<string, string> = { cm15: "15秒", cm30: "30秒", cm60: "60秒" };
  const CM_TYPE_COLORS: Record<string, string> = { cm15: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400", cm30: "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400", cm60: "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" };

  // CSV export
  const exportCsv = () => {
    const header = ["名前", "イベント", "日時", "ステップスコア", "CMスコア", "合計スコア", "アンケート完了", "CM視聴", "写真閲覧", "DL完了", "CM再生数", "CM完了率"];
    const rows = [header.join(",")];
    for (const s of sorted) {
      const name = s.record.respondentName || "匿名";
      const evt = s.event?.name || s.record.eventId;
      const date = formatDate(s.record.timestamp);
      const cmCompleted = s.videoPlays.filter((p) => p.completed).length;
      const cmRate = s.videoPlays.length > 0 ? Math.round((cmCompleted / s.videoPlays.length) * 100) + "%" : "—";
      const row = [
        name, evt, date,
        String(s.stepScore), String(s.cmScore), String(s.stepScore + s.cmScore),
        s.record.stepsCompleted.survey ? "Yes" : "No",
        s.record.stepsCompleted.cmViewed ? "Yes" : "No",
        s.record.stepsCompleted.photosViewed ? "Yes" : "No",
        s.record.stepsCompleted.downloaded ? "Yes" : "No",
        String(s.videoPlays.length),
        cmRate,
      ].map((v) => v.includes(",") ? `"${v}"` : v);
      rows.push(row.join(","));
    }
    const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ユーザー一覧_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          <p className="text-sm text-gray-400 dark:text-gray-500">ユーザー管理を読み込み中...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title={IS_DEMO_MODE ? "ユーザー管理 (Demo)" : "ユーザー管理"}
        badge={`${stats.total}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "総セッション", value: String(stats.total), icon: "👥", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" },
            { label: "名前入力済み", value: String(stats.named), icon: "✏️", color: "bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-400" },
            { label: "DL完了", value: String(stats.downloaded), icon: "📥", color: "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" },
            { label: "平均スコア", value: `${stats.avgScore}pt`, icon: "⭐", color: "bg-purple-50 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" },
          ].map((s) => (
            <Card key={s.label} className="text-center">
              <div className={`inline-flex w-9 h-9 rounded-full items-center justify-center text-base mb-1.5 ${s.color}`}>
                {s.icon}
              </div>
              <p className="text-xl font-bold text-gray-800 dark:text-gray-100">{s.value}</p>
              <p className="text-[10px] text-gray-400 dark:text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <Card>
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <input
                className={inputCls + " pl-8"}
                placeholder="名前・イベントで検索"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                aria-label="ユーザーを名前またはイベントで検索"
                data-testid="users-filter-text"
              />
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 text-sm pointer-events-none">
                🔍
              </span>
            </div>
            <select
              value={filterEvent}
              onChange={(e) => setFilterEvent(e.target.value)}
              aria-label="イベントフィルター"
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-xs text-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200"
              data-testid="users-event-filter"
            >
              <option value="all">全イベント</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>{evt.name}</option>
              ))}
            </select>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              aria-label="並び替え"
              className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] text-xs text-gray-600 bg-white dark:bg-gray-700 dark:text-gray-200"
              data-testid="users-sort-select"
            >
              <option value="date-desc">日付: 新しい順</option>
              <option value="date-asc">日付: 古い順</option>
              <option value="name-asc">名前: A→Z</option>
              <option value="score-desc">スコア: 高い順</option>
              <option value="score-asc">スコア: 低い順</option>
            </select>
            <button
              onClick={exportCsv}
              aria-label="ユーザーデータをCSVエクスポート"
              className="text-xs px-4 py-2 rounded-lg bg-green-500 text-white hover:bg-green-600 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-green-400"
            >
              CSVエクスポート
            </button>
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-2">
            {filterText || filterEvent !== "all"
              ? `${sorted.length}件 / ${sessions.length}件表示`
              : `${sessions.length}件のユーザーセッション`}
          </p>
        </Card>

        {/* User list */}
        {sorted.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
              {sessions.length === 0
                ? "まだユーザーデータがありません。ユーザーがアクセスするとここに表示されます。"
                : "条件に一致するユーザーがいません。"}
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sorted.map((session) => {
              const r = session.record;
              const isExpanded = expandedId === r.id;
              const totalScore = session.stepScore + session.cmScore;
              const questions = getSurveyQuestions(r.eventId);

              return (
                <Card key={r.id}>
                  {/* Header row */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                    aria-expanded={isExpanded}
                    aria-label={`${r.respondentName || "匿名ユーザー"}の詳細を${isExpanded ? "閉じる" : "開く"}`}
                    className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                        totalScore >= 150 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : totalScore >= 80 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                      }`}>
                        {r.respondentName ? r.respondentName.charAt(0) : "?"}
                      </div>

                      {/* Name + event */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">
                            {r.respondentName || "匿名ユーザー"}
                          </span>
                          <span className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-1.5 py-0.5 rounded-full truncate max-w-[120px]">
                            {session.event?.name || r.eventId}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-400 dark:text-gray-500">{formatDate(r.timestamp)}</p>
                      </div>

                      {/* Scores */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ScoreBadge score={session.stepScore} max={100} label="STEP" />
                        <ScoreBadge score={session.cmScore} max={100} label="CM" />
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${
                          totalScore >= 150 ? "bg-green-500 text-white"
                            : totalScore >= 80 ? "bg-yellow-400 text-white"
                              : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                        }`}>
                          {totalScore}pt
                        </span>
                      </div>

                      {/* Expand arrow */}
                      <span className={`text-gray-400 dark:text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}>
                        ▼
                      </span>
                    </div>

                    {/* Step progress dots */}
                    <div className="flex gap-1.5 mt-2 ml-[52px]">
                      <StepDot done={r.stepsCompleted.access} label="アクセス" />
                      <StepDot done={r.stepsCompleted.survey} label="アンケート" />
                      <StepDot done={r.stepsCompleted.cmViewed} label="CM視聴" />
                      <StepDot done={r.stepsCompleted.photosViewed} label="写真閲覧" />
                      <StepDot done={r.stepsCompleted.downloaded} label="DL完了" />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 space-y-4">
                      {/* Survey answers */}
                      {r.surveyAnswers && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">アンケート回答</h4>
                          <div className="space-y-2">
                            {questions.map((q, qi) => {
                              const tags = r.surveyAnswers?.[q.id] || [];
                              return (
                                <div key={q.id} className="flex items-start gap-2">
                                  <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 w-8">Q{qi + 1}</span>
                                  <div className="flex flex-wrap gap-1">
                                    {tags.length > 0 ? tags.map((t) => (
                                      <span key={t} className="text-[10px] bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">
                                        {getTagLabel(t, questions)}
                                      </span>
                                    )) : (
                                      <span className="text-[10px] text-gray-400 dark:text-gray-500">未回答</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Matched companies */}
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">マッチ企業:</span>
                        {session.platinumCompany && (
                          <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full font-bold">
                            Platinum: {session.platinumCompany.name}
                          </span>
                        )}
                        {session.matchedCompany && (
                          <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-0.5 rounded-full font-bold">
                            Matched: {session.matchedCompany.name}
                          </span>
                        )}
                        {!session.platinumCompany && !session.matchedCompany && (
                          <span className="text-[10px] text-gray-400 dark:text-gray-500">なし</span>
                        )}
                      </div>

                      {/* CM viewing history */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">
                          CM視聴履歴 ({session.videoPlays.length}件)
                        </h4>
                        {session.videoPlays.length === 0 ? (
                          <p className="text-[10px] text-gray-400 dark:text-gray-500">CM視聴記録なし</p>
                        ) : (
                          <div className="space-y-1.5">
                            {session.videoPlays.map((vp) => (
                              <div key={vp.id} className="flex items-center gap-2 text-[10px]">
                                <span className={`px-1.5 py-0.5 rounded font-bold ${CM_TYPE_COLORS[vp.cmType]}`}>
                                  {CM_TYPE_LABELS[vp.cmType]}
                                </span>
                                <span className="text-gray-600 dark:text-gray-300 truncate flex-1">{vp.companyName}</span>
                                <span className="text-gray-400 dark:text-gray-500">{vp.watchedSeconds}秒/{vp.duration}秒</span>
                                <div className="w-16 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                                  <div
                                    className={`h-full rounded-full ${vp.completed ? "bg-green-400" : "bg-red-300"}`}
                                    style={{ width: `${Math.min(100, (vp.watchedSeconds / vp.duration) * 100)}%` }}
                                  />
                                </div>
                                <span className={vp.completed ? "text-green-500" : "text-red-400"}>
                                  {vp.completed ? "完了" : "途中"}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Session ID */}
                      <p className="text-[10px] text-gray-300 dark:text-gray-500 font-mono">ID: {r.id}</p>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        {/* Score legend */}
        <Card>
          <h3 className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">スコア計算方法</h3>
          <div className="grid grid-cols-2 gap-2 text-[10px] text-gray-500 dark:text-gray-400">
            <div>
              <p className="font-bold text-gray-600 dark:text-gray-300 mb-1">STEPスコア (100pt満点)</p>
              <p>アンケート完了: +{SCORE_WEIGHTS.survey}pt</p>
              <p>CM視聴: +{SCORE_WEIGHTS.cmViewed}pt</p>
              <p>写真閲覧: +{SCORE_WEIGHTS.photosViewed}pt</p>
              <p>DL完了: +{SCORE_WEIGHTS.downloaded}pt</p>
            </div>
            <div>
              <p className="font-bold text-gray-600 dark:text-gray-300 mb-1">CMスコア (100pt満点)</p>
              <p>完了率 x 60% + 視聴率 x 40%</p>
              <p className="mt-1">
                <span className="bg-green-500 text-white px-1.5 py-0.5 rounded">150+</span> 優良
                <span className="bg-yellow-400 text-white px-1.5 py-0.5 rounded ml-1">80+</span> 標準
                <span className="bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300 px-1.5 py-0.5 rounded ml-1">&lt;80</span> 低
              </p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
