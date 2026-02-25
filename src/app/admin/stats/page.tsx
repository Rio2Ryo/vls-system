"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import { ADMIN_PASSWORD } from "@/lib/data";
import { getStoredCompanies, getStoredEvents, getStoredVideoPlays, clearVideoPlays } from "@/lib/store";
import { Company, EventData, VideoPlayRecord } from "@/lib/types";

export default function StatsPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [plays, setPlays] = useState<VideoPlayRecord[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterCmType, setFilterCmType] = useState("all");

  useEffect(() => {
    setPlays(getStoredVideoPlays());
    setCompanies(getStoredCompanies());
    setEvents(getStoredEvents());
  }, []);

  useEffect(() => {
    if (sessionStorage.getItem("adminAuthed") === "true") setAuthed(true);
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
      sessionStorage.setItem("adminAuthed", "true");
    } else {
      setPwError("パスワードが違います");
    }
  };

  // Filtered plays
  const filtered = useMemo(() => {
    let result = plays;
    if (filterEvent !== "all") result = result.filter((p) => p.eventId === filterEvent);
    if (filterCmType !== "all") result = result.filter((p) => p.cmType === filterCmType);
    return result;
  }, [plays, filterEvent, filterCmType]);

  // Stats per company
  const companyStats = useMemo(() => {
    const map = new Map<string, {
      companyId: string;
      companyName: string;
      company: Company | undefined;
      totalPlays: number;
      completed: number;
      totalWatched: number;
      totalDuration: number;
      byCmType: Record<string, { plays: number; completed: number; watchedSec: number; duration: number }>;
    }>();

    for (const p of filtered) {
      if (!map.has(p.companyId)) {
        map.set(p.companyId, {
          companyId: p.companyId,
          companyName: p.companyName,
          company: companies.find((c) => c.id === p.companyId),
          totalPlays: 0,
          completed: 0,
          totalWatched: 0,
          totalDuration: 0,
          byCmType: {},
        });
      }
      const s = map.get(p.companyId)!;
      s.totalPlays++;
      if (p.completed) s.completed++;
      s.totalWatched += p.watchedSeconds;
      s.totalDuration += p.duration;

      if (!s.byCmType[p.cmType]) {
        s.byCmType[p.cmType] = { plays: 0, completed: 0, watchedSec: 0, duration: 0 };
      }
      const ct = s.byCmType[p.cmType];
      ct.plays++;
      if (p.completed) ct.completed++;
      ct.watchedSec += p.watchedSeconds;
      ct.duration += p.duration;
    }

    return Array.from(map.values()).sort((a, b) => b.totalPlays - a.totalPlays);
  }, [filtered, companies]);

  // Global totals
  const totals = useMemo(() => {
    const totalPlays = filtered.length;
    const totalCompleted = filtered.filter((p) => p.completed).length;
    const totalWatched = filtered.reduce((s, p) => s + p.watchedSeconds, 0);
    const totalDuration = filtered.reduce((s, p) => s + p.duration, 0);
    return {
      totalPlays,
      totalCompleted,
      completionRate: totalPlays > 0 ? Math.round((totalCompleted / totalPlays) * 100) : 0,
      avgWatchSec: totalPlays > 0 ? Math.round(totalWatched / totalPlays) : 0,
      avgDuration: totalPlays > 0 ? Math.round(totalDuration / totalPlays) : 0,
    };
  }, [filtered]);

  // Per-video stats (grouped by videoId + cmType)
  const videoStats = useMemo(() => {
    const map = new Map<string, {
      videoId: string;
      cmType: string;
      companyName: string;
      plays: number;
      completed: number;
      totalWatched: number;
      duration: number;
    }>();

    for (const p of filtered) {
      const key = `${p.videoId}:${p.cmType}`;
      if (!map.has(key)) {
        map.set(key, {
          videoId: p.videoId,
          cmType: p.cmType,
          companyName: p.companyName,
          plays: 0,
          completed: 0,
          totalWatched: 0,
          duration: p.duration,
        });
      }
      const s = map.get(key)!;
      s.plays++;
      if (p.completed) s.completed++;
      s.totalWatched += p.watchedSeconds;
    }

    return Array.from(map.values()).sort((a, b) => b.plays - a.plays);
  }, [filtered]);

  const maxPlays = Math.max(...companyStats.map((s) => s.totalPlays), 1);
  const maxVideoPlays = Math.max(...videoStats.map((s) => s.plays), 1);

  const CM_TYPE_LABELS: Record<string, string> = {
    cm15: "15秒CM",
    cm30: "30秒CM",
    cm60: "60秒CM",
  };

  const CM_TYPE_COLORS: Record<string, string> = {
    cm15: "bg-blue-400",
    cm30: "bg-green-400",
    cm60: "bg-purple-400",
  };

  const handleClear = () => {
    clearVideoPlays();
    setPlays([]);
  };

  // Login screen
  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">
            CM統計ダッシュボード
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="stats-password"
            />
            {pwError && <p className="text-red-400 text-sm text-center">{pwError}</p>}
            <Button type="submit" size="md" className="w-full">
              ログイン
            </Button>
          </form>
        </Card>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <AdminHeader
        title="CM統計ダッシュボード"
        badge={`${filtered.length}再生`}
        onLogout={() => { setAuthed(false); sessionStorage.removeItem("adminAuthed"); }}
        actions={
          <button onClick={handleClear} className="text-xs text-red-400 hover:text-red-600">
            データクリア
          </button>
        }
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterEvent}
            onChange={(e) => setFilterEvent(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
            data-testid="stats-event-filter"
          >
            <option value="all">全イベント</option>
            {events.map((evt) => (
              <option key={evt.id} value={evt.id}>{evt.name}</option>
            ))}
          </select>
          <select
            value={filterCmType}
            onChange={(e) => setFilterCmType(e.target.value)}
            className="text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-[#6EC6FF]"
            data-testid="stats-cm-type-filter"
          >
            <option value="all">全CMタイプ</option>
            <option value="cm15">15秒CM</option>
            <option value="cm30">30秒CM</option>
            <option value="cm60">60秒CM</option>
          </select>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "総再生回数", value: String(totals.totalPlays), icon: "▶", color: "bg-blue-50 text-blue-600" },
            { label: "視聴完了率", value: `${totals.completionRate}%`, icon: "✓", color: "bg-green-50 text-green-600" },
            { label: "平均視聴時間", value: `${totals.avgWatchSec}秒`, icon: "⏱", color: "bg-purple-50 text-purple-600" },
            { label: "平均CM尺", value: `${totals.avgDuration}秒`, icon: "🎬", color: "bg-yellow-50 text-yellow-700" },
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

        {filtered.length === 0 ? (
          <Card>
            <p className="text-sm text-gray-400 text-center py-8">
              まだ再生データがありません。ユーザーがCM動画を視聴すると統計が表示されます。
            </p>
          </Card>
        ) : (
          <>
            {/* Company play count bar chart */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">企業別 再生回数</h3>
              <div className="space-y-3">
                {companyStats.map((cs) => {
                  const compRate = cs.totalPlays > 0 ? Math.round((cs.completed / cs.totalPlays) * 100) : 0;
                  const avgWatch = cs.totalPlays > 0 ? Math.round(cs.totalWatched / cs.totalPlays) : 0;
                  return (
                    <div key={cs.companyId} data-testid={`stats-company-${cs.companyId}`}>
                      <div className="flex items-center gap-3 mb-1">
                        {cs.company && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cs.company.logoUrl} alt={cs.companyName} className="w-7 h-7 rounded-full flex-shrink-0" />
                        )}
                        <span className="text-sm text-gray-700 flex-1 truncate">{cs.companyName}</span>
                        <span className="text-xs text-gray-400 flex-shrink-0">{cs.totalPlays}回</span>
                      </div>
                      <div className="flex items-center gap-2 ml-10">
                        <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#6EC6FF] transition-all duration-500"
                            style={{ width: `${(cs.totalPlays / maxPlays) * 100}%` }}
                          />
                        </div>
                        <div className="flex gap-2 text-[10px] flex-shrink-0">
                          <span className="text-green-500">完了{compRate}%</span>
                          <span className="text-gray-400">平均{avgWatch}秒</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Per-video stats */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">動画別 再生統計</h3>
              <div className="space-y-3">
                {videoStats.map((vs) => {
                  const compRate = vs.plays > 0 ? Math.round((vs.completed / vs.plays) * 100) : 0;
                  const avgWatch = vs.plays > 0 ? Math.round(vs.totalWatched / vs.plays) : 0;
                  return (
                    <div key={`${vs.videoId}:${vs.cmType}`} className="border border-gray-100 rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full text-white font-bold ${CM_TYPE_COLORS[vs.cmType] || "bg-gray-400"}`}>
                          {CM_TYPE_LABELS[vs.cmType] || vs.cmType}
                        </span>
                        <span className="text-sm text-gray-700 truncate">{vs.companyName}</span>
                        <code className="text-[10px] text-gray-400 font-mono ml-auto flex-shrink-0">{vs.videoId}</code>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-4 relative overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CM_TYPE_COLORS[vs.cmType] || "bg-gray-400"} transition-all duration-500`}
                            style={{ width: `${(vs.plays / maxVideoPlays) * 100}%` }}
                          />
                          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-gray-700">
                            {vs.plays}再生
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-4 mt-1.5 text-xs">
                        <span className="text-gray-500">
                          完了率: <b className={compRate >= 80 ? "text-green-600" : compRate >= 50 ? "text-yellow-600" : "text-red-500"}>{compRate}%</b>
                        </span>
                        <span className="text-gray-500">
                          平均視聴: <b>{avgWatch}秒</b> / {vs.duration}秒
                        </span>
                        <span className="text-gray-500">
                          完了: <b>{vs.completed}</b> / {vs.plays}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Completion rate by CM type */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">CMタイプ別 完了率</h3>
              <div className="space-y-3">
                {(["cm15", "cm30", "cm60"] as const).map((cmType) => {
                  const typePlays = filtered.filter((p) => p.cmType === cmType);
                  const typeCompleted = typePlays.filter((p) => p.completed).length;
                  const typeRate = typePlays.length > 0 ? Math.round((typeCompleted / typePlays.length) * 100) : 0;
                  const typeAvg = typePlays.length > 0 ? Math.round(typePlays.reduce((s, p) => s + p.watchedSeconds, 0) / typePlays.length) : 0;
                  const expectedDur = cmType === "cm15" ? 15 : cmType === "cm30" ? 30 : 60;
                  return (
                    <div key={cmType} className="flex items-center gap-3">
                      <span className={`text-xs px-3 py-1 rounded-full text-white font-bold w-20 text-center ${CM_TYPE_COLORS[cmType]}`}>
                        {CM_TYPE_LABELS[cmType]}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-6 relative overflow-hidden">
                            {/* Completion rate bar */}
                            <div
                              className={`h-full rounded-full ${CM_TYPE_COLORS[cmType]} opacity-80 transition-all duration-500`}
                              style={{ width: `${typeRate}%` }}
                            />
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
                              {typePlays.length > 0 ? `${typeRate}% (${typeCompleted}/${typePlays.length})` : "データなし"}
                            </span>
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          平均視聴 {typeAvg}秒 / {expectedDur}秒
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* Recent plays timeline */}
            <Card>
              <h3 className="font-bold text-gray-700 mb-4">最近の再生履歴</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filtered.slice().reverse().slice(0, 50).map((p) => {
                  const dt = new Date(p.timestamp);
                  const timeStr = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
                  const dateStr = `${dt.getMonth() + 1}/${dt.getDate()}`;
                  return (
                    <div key={p.id} className="flex items-center gap-2 text-xs py-1 border-b border-gray-50">
                      <span className="text-gray-400 w-16 flex-shrink-0">{dateStr} {timeStr}</span>
                      <span className={`px-1.5 py-0.5 rounded text-white text-[10px] font-bold ${CM_TYPE_COLORS[p.cmType]}`}>
                        {CM_TYPE_LABELS[p.cmType]}
                      </span>
                      <span className="text-gray-600 truncate flex-1">{p.companyName}</span>
                      <span className="text-gray-400 flex-shrink-0">{p.watchedSeconds}秒/{p.duration}秒</span>
                      <span className={`flex-shrink-0 ${p.completed ? "text-green-500" : "text-red-400"}`}>
                        {p.completed ? "完了" : "途中離脱"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
