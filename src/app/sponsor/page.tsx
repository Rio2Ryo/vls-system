"use client";

import { useEffect, useState, useMemo } from "react";
import { Company, VideoPlayRecord, AnalyticsRecord, EventData } from "@/lib/types";
import {
  getStoredCompanies,
  setStoredCompanies,
  getStoredVideoPlays,
  getStoredAnalytics,
  getStoredEvents,
  getCompanyByPortalLogin,
} from "@/lib/store";
import { csrfHeaders } from "@/lib/csrf";
import { extractYouTubeId } from "@/components/admin/tabs/adminUtils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type Tab = "cm" | "report" | "offer";

export default function SponsorPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loginId, setLoginId] = useState("");
  const [loginPw, setLoginPw] = useState("");
  const [loginError, setLoginError] = useState("");
  const [tab, setTab] = useState<Tab>("cm");

  // Check sessionStorage on mount
  useEffect(() => {
    const savedId = sessionStorage.getItem("sponsorCompanyId");
    const savedPw = sessionStorage.getItem("sponsorPassword");
    if (savedId && savedPw) {
      const c = getCompanyByPortalLogin(savedId, savedPw);
      if (c) setCompany(c);
    }
  }, []);

  const handleLogin = () => {
    setLoginError("");
    if (!loginId || !loginPw) {
      setLoginError("企業IDとパスワードを入力してください");
      return;
    }
    const c = getCompanyByPortalLogin(loginId, loginPw);
    if (!c) {
      setLoginError("認証に失敗しました。企業IDとパスワードを確認してください。");
      return;
    }
    sessionStorage.setItem("sponsorCompanyId", loginId);
    sessionStorage.setItem("sponsorPassword", loginPw);
    setCompany(c);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("sponsorCompanyId");
    sessionStorage.removeItem("sponsorPassword");
    setCompany(null);
    setLoginId("");
    setLoginPw("");
  };

  if (!company) {
    return <LoginScreen
      loginId={loginId}
      setLoginId={setLoginId}
      loginPw={loginPw}
      setLoginPw={setLoginPw}
      loginError={loginError}
      onLogin={handleLogin}
    />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={company.logoUrl} alt={company.name} className="w-10 h-10 rounded-full" />
            <div>
              <h1 className="font-bold text-gray-800 text-sm">{company.name}</h1>
              <p className="text-[10px] text-gray-400 uppercase font-bold">{company.tier} Sponsor Portal</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
            aria-label="ログアウト"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <nav className="max-w-4xl mx-auto px-4 pt-4">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1" role="tablist" aria-label="スポンサーポータルタブ">
          {([
            { key: "cm" as Tab, label: "CM素材管理" },
            { key: "report" as Tab, label: "再生レポート" },
            { key: "offer" as Tab, label: "オファー/クーポン" },
          ]).map(({ key, label }) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                tab === key
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Tab Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {tab === "cm" && <CMTab company={company} onUpdate={setCompany} />}
        {tab === "report" && <ReportTab company={company} />}
        {tab === "offer" && <OfferTab company={company} onUpdate={setCompany} />}
      </main>
    </div>
  );
}

/* ==================== Login Screen ==================== */
function LoginScreen({
  loginId, setLoginId, loginPw, setLoginPw, loginError, onLogin,
}: {
  loginId: string;
  setLoginId: (v: string) => void;
  loginPw: string;
  setLoginPw: (v: string) => void;
  loginError: string;
  onLogin: () => void;
}) {
  const companies = getStoredCompanies().filter((c) => c.portalPassword);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-800">スポンサーポータル</h1>
          <p className="text-xs text-gray-400 mt-1">企業担当者向け管理画面</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">企業</label>
            <select
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm"
              aria-label="企業選択"
            >
              <option value="">企業を選択...</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name} ({c.tier})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-600 mb-1">パスワード</label>
            <input
              type="password"
              value={loginPw}
              onChange={(e) => setLoginPw(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              placeholder="ポータルパスワード"
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm"
              aria-label="パスワード"
            />
          </div>

          {loginError && (
            <p className="text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg" role="alert">{loginError}</p>
          )}

          <button
            onClick={onLogin}
            className="w-full py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          >
            ログイン
          </button>
        </div>
      </div>
    </div>
  );
}

/* ==================== Tab A — CM素材管理 ==================== */
function CMTab({ company, onUpdate }: { company: Company; onUpdate: (c: Company) => void }) {
  const [cm15, setCm15] = useState(company.videos.cm15);
  const [cm30, setCm30] = useState(company.videos.cm30);
  const [cm60, setCm60] = useState(company.videos.cm60);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const updates = { videos: { cm15, cm30, cm60 } };
      const res = await fetch("/api/sponsor/update", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          companyId: company.id,
          password: sessionStorage.getItem("sponsorPassword"),
          updates,
        }),
      });
      if (res.ok) {
        // Update local store too
        const companies = getStoredCompanies();
        const updated = companies.map((c) =>
          c.id === company.id ? { ...c, videos: { cm15, cm30, cm60 } } : c
        );
        setStoredCompanies(updated);
        const updatedCompany = updated.find((c) => c.id === company.id)!;
        onUpdate(updatedCompany);
        setMsg("CM素材を保存しました");
      } else {
        setMsg("保存に失敗しました");
      }
    } catch {
      setMsg("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">CM素材管理</h2>

      {/* YouTube ID editors */}
      {([
        { label: "15秒CM", value: cm15, setter: setCm15 },
        { label: "30秒CM", value: cm30, setter: setCm30 },
        { label: "60秒CM", value: cm60, setter: setCm60 },
      ] as const).map(({ label, value, setter }) => (
        <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <p className="text-sm font-bold text-gray-700">{label}</p>
          <input
            value={value}
            onChange={(e) => setter(extractYouTubeId(e.target.value))}
            placeholder="YouTube URL または ID"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm font-mono"
            aria-label={`${label} YouTube ID`}
          />
          {value && (
            <div className="aspect-video rounded-lg overflow-hidden bg-gray-100">
              <iframe
                src={`https://www.youtube.com/embed/${value}`}
                title={label}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      ))}

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.includes("失敗") ? "text-red-500 bg-red-50" : "text-green-600 bg-green-50"}`} role="status" aria-live="polite">
          {msg}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
      >
        {saving ? "保存中..." : "CM素材を保存"}
      </button>
    </div>
  );
}

/* ==================== Tab B — 再生レポート ==================== */
function ReportTab({ company }: { company: Company }) {
  const [plays, setPlays] = useState<VideoPlayRecord[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);

  useEffect(() => {
    const allPlays = getStoredVideoPlays().filter((p) => p.companyId === company.id);
    setPlays(allPlays);
    setEvents(getStoredEvents());
    setAnalytics(getStoredAnalytics());
  }, [company.id]);

  const totalPlays = plays.length;
  const completedPlays = plays.filter((p) => p.completed).length;
  const completionRate = totalPlays > 0 ? Math.round((completedPlays / totalPlays) * 100) : 0;
  const avgWatchSeconds = totalPlays > 0
    ? Math.round(plays.reduce((sum, p) => sum + p.watchedSeconds, 0) / totalPlays)
    : 0;

  // Matched user count from analytics
  const matchedUsers = analytics.filter((a) => a.matchedCompanyId === company.id || a.platinumCompanyId === company.id).length;

  // By CM type
  const byCmType = (type: "cm15" | "cm30" | "cm60") => {
    const typed = plays.filter((p) => p.cmType === type);
    const comp = typed.filter((p) => p.completed).length;
    return {
      plays: typed.length,
      completed: comp,
      rate: typed.length > 0 ? Math.round((comp / typed.length) * 100) : 0,
    };
  };
  const cm15 = byCmType("cm15");
  const cm30 = byCmType("cm30");
  const cm60 = byCmType("cm60");

  // By event
  const eventStats = useMemo(() => {
    const evtMap = new Map(events.map((e) => [e.id, e.name]));
    const map = new Map<string, { plays: number; completed: number }>();
    for (const p of plays) {
      if (!map.has(p.eventId)) map.set(p.eventId, { plays: 0, completed: 0 });
      const entry = map.get(p.eventId)!;
      entry.plays++;
      if (p.completed) entry.completed++;
    }
    return Array.from(map.entries()).map(([eventId, stats]) => ({
      eventId,
      eventName: evtMap.get(eventId) || eventId,
      ...stats,
      rate: stats.plays > 0 ? Math.round((stats.completed / stats.plays) * 100) : 0,
    }));
  }, [plays, events]);

  // Chart data for completion rate by CM type
  const chartData = [
    { name: "15秒", 再生数: cm15.plays, 完了率: cm15.rate },
    { name: "30秒", 再生数: cm30.plays, 完了率: cm30.rate },
    { name: "60秒", 再生数: cm60.plays, 完了率: cm60.rate },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">再生レポート</h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "総再生数", value: totalPlays, unit: "回" },
          { label: "完了率", value: completionRate, unit: "%" },
          { label: "平均視聴", value: avgWatchSeconds, unit: "秒" },
          { label: "マッチユーザー", value: matchedUsers, unit: "人" },
        ].map(({ label, value, unit }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-2xl font-bold text-blue-600">{value}<span className="text-xs text-gray-400 ml-1">{unit}</span></p>
            <p className="text-[10px] text-gray-500 font-bold mt-1">{label}</p>
          </div>
        ))}
      </div>

      {/* CM Type Breakdown */}
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <h3 className="text-sm font-bold text-gray-700 mb-3">CM尺別内訳</h3>
        <div className="overflow-x-auto touch-pan-x">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500">CM尺</th>
                <th className="text-right py-2 text-gray-500">再生数</th>
                <th className="text-right py-2 text-gray-500">完了数</th>
                <th className="text-right py-2 text-gray-500">完了率</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "15秒", ...cm15 },
                { label: "30秒", ...cm30 },
                { label: "60秒", ...cm60 },
              ].map((row) => (
                <tr key={row.label} className="border-b border-gray-50">
                  <td className="py-2 font-bold">{row.label}</td>
                  <td className="py-2 text-right">{row.plays}</td>
                  <td className="py-2 text-right">{row.completed}</td>
                  <td className="py-2 text-right">{row.rate}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Chart */}
      {totalPlays > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">CM尺別完了率</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="完了率" fill="#3B82F6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Event Breakdown */}
      {eventStats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-bold text-gray-700 mb-3">イベント別内訳</h3>
          <div className="overflow-x-auto touch-pan-x">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-gray-500">イベント</th>
                  <th className="text-right py-2 text-gray-500">再生数</th>
                  <th className="text-right py-2 text-gray-500">完了数</th>
                  <th className="text-right py-2 text-gray-500">完了率</th>
                </tr>
              </thead>
              <tbody>
                {eventStats.map((row) => (
                  <tr key={row.eventId} className="border-b border-gray-50">
                    <td className="py-2 font-bold">{row.eventName}</td>
                    <td className="py-2 text-right">{row.plays}</td>
                    <td className="py-2 text-right">{row.completed}</td>
                    <td className="py-2 text-right">{row.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {totalPlays === 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-8 text-center">
          <p className="text-gray-400 text-sm">まだ再生データがありません</p>
        </div>
      )}
    </div>
  );
}

/* ==================== Tab C — オファー/クーポン編集 ==================== */
function OfferTab({ company, onUpdate }: { company: Company; onUpdate: (c: Company) => void }) {
  const [offerText, setOfferText] = useState(company.offerText);
  const [offerUrl, setOfferUrl] = useState(company.offerUrl);
  const [couponCode, setCouponCode] = useState(company.couponCode || "");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const updates = {
        offerText,
        offerUrl,
        couponCode: couponCode || undefined,
      };
      const res = await fetch("/api/sponsor/update", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          companyId: company.id,
          password: sessionStorage.getItem("sponsorPassword"),
          updates,
        }),
      });
      if (res.ok) {
        const companies = getStoredCompanies();
        const updated = companies.map((c) =>
          c.id === company.id ? { ...c, offerText, offerUrl, couponCode: couponCode || undefined } : c
        );
        setStoredCompanies(updated);
        const updatedCompany = updated.find((c) => c.id === company.id)!;
        onUpdate(updatedCompany);
        setMsg("オファー情報を保存しました");
      } else {
        setMsg("保存に失敗しました");
      }
    } catch {
      setMsg("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800">オファー/クーポン編集</h2>

      {/* Edit Form */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-4">
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">オファーテキスト</label>
          <input
            value={offerText}
            onChange={(e) => setOfferText(e.target.value)}
            placeholder="例: 無料体験レッスン1ヶ月分プレゼント！"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm"
            aria-label="オファーテキスト"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">オファーURL</label>
          <input
            value={offerUrl}
            onChange={(e) => setOfferUrl(e.target.value)}
            placeholder="https://example.com/offer"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm font-mono"
            aria-label="オファーURL"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-1">クーポンコード</label>
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value)}
            placeholder="例: VLSKIDS2026"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 text-sm font-mono"
            aria-label="クーポンコード"
          />
        </div>
      </div>

      {/* Preview Card */}
      <div>
        <h3 className="text-sm font-bold text-gray-700 mb-2">プレビュー（完了画面での表示）</h3>
        <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={company.logoUrl} alt={company.name} className="w-12 h-12 rounded-full" />
            <div>
              <p className="font-bold text-gray-800 text-sm">{company.name}</p>
              <p className="text-[10px] text-gray-400 uppercase font-bold">{company.tier}</p>
            </div>
          </div>
          {offerText && (
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-sm text-blue-800 font-bold">{offerText}</p>
              {offerUrl && (
                <p className="text-xs text-blue-500 mt-1 truncate">{offerUrl}</p>
              )}
            </div>
          )}
          {couponCode && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
              <p className="text-[10px] text-yellow-600 font-bold mb-1">クーポンコード</p>
              <p className="text-lg font-mono font-bold text-yellow-800 tracking-wider">{couponCode}</p>
            </div>
          )}
          {!offerText && !couponCode && (
            <p className="text-xs text-gray-400 text-center py-4">オファー情報を入力するとプレビューが表示されます</p>
          )}
        </div>
      </div>

      {msg && (
        <p className={`text-xs px-3 py-2 rounded-lg ${msg.includes("失敗") ? "text-red-500 bg-red-50" : "text-green-600 bg-green-50"}`} role="status" aria-live="polite">
          {msg}
        </p>
      )}

      <button
        onClick={save}
        disabled={saving}
        className="w-full py-2.5 bg-blue-600 text-white font-bold text-sm rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
      >
        {saving ? "保存中..." : "オファー情報を保存"}
      </button>
    </div>
  );
}
