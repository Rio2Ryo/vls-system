"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { ADMIN_PASSWORD, EVENTS, COMPANIES, DEFAULT_SURVEY } from "@/lib/data";

type Tab = "events" | "photos" | "companies" | "survey" | "dashboard";

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [pw, setPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (pw === ADMIN_PASSWORD) {
      setAuthed(true);
    } else {
      setPwError("パスワードが違います");
    }
  };

  if (!authed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <Card className="w-full max-w-sm">
          <h1 className="text-xl font-bold text-gray-800 text-center mb-4">
            管理画面ログイン
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="管理パスワード"
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-center"
              data-testid="admin-password"
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

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "dashboard", label: "ダッシュボード", icon: "📊" },
    { key: "events", label: "イベント管理", icon: "🎪" },
    { key: "photos", label: "写真管理", icon: "📷" },
    { key: "companies", label: "企業管理", icon: "🏢" },
    { key: "survey", label: "アンケート", icon: "📝" },
  ];

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="font-bold text-gray-800">VLS Admin</h1>
          <button
            onClick={() => setAuthed(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            ログアウト
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-6">
        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                tab === t.key
                  ? "bg-[#6EC6FF] text-white shadow-sm"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            {tab === "dashboard" && <DashboardTab />}
            {tab === "events" && <EventsTab />}
            {tab === "photos" && <PhotosTab />}
            {tab === "companies" && <CompaniesTab />}
            {tab === "survey" && <SurveyTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </main>
  );
}

function DashboardTab() {
  const stats = [
    { label: "総アクセス数", value: "1,247", icon: "👥", color: "bg-blue-50 text-blue-600" },
    { label: "CM再生数", value: "1,089", icon: "▶️", color: "bg-pink-50 text-pink-600" },
    { label: "ダウンロード数", value: "834", icon: "📥", color: "bg-green-50 text-green-600" },
    { label: "登録イベント", value: String(EVENTS.length), icon: "🎪", color: "bg-yellow-50 text-yellow-700" },
  ];

  return (
    <div className="space-y-6" data-testid="admin-dashboard">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map((s) => (
          <Card key={s.label} className="text-center">
            <div className={`inline-flex w-10 h-10 rounded-full items-center justify-center text-lg mb-2 ${s.color}`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </Card>
        ))}
      </div>

      <Card>
        <h3 className="font-bold text-gray-700 mb-3">企業別CM再生数</h3>
        <div className="space-y-2">
          {COMPANIES.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logoUrl} alt={c.name} className="w-8 h-8 rounded-full" />
              <span className="text-sm text-gray-600 flex-1">{c.name}</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase">{c.tier}</span>
              <span className="text-sm font-bold text-gray-700">{Math.floor(Math.random() * 300 + 100)}回</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function EventsTab() {
  return (
    <div className="space-y-4" data-testid="admin-events">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">イベント一覧</h2>
        <Button size="sm">+ 新規作成</Button>
      </div>
      {EVENTS.map((evt) => (
        <Card key={evt.id}>
          <div className="flex justify-between items-start">
            <div>
              <h3 className="font-bold text-gray-700">{evt.name}</h3>
              <p className="text-sm text-gray-400">{evt.date} · {evt.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                パスワード: <code className="bg-gray-100 px-2 py-0.5 rounded font-mono">{evt.password}</code>
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                {evt.photos.length}枚
              </span>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function PhotosTab() {
  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>
      <Card>
        <div
          className="border-2 border-dashed border-gray-200 rounded-2xl p-8 text-center cursor-pointer hover:border-[#6EC6FF] transition-colors"
          data-testid="photo-upload-zone"
        >
          <div className="text-4xl mb-2">📁</div>
          <p className="font-medium text-gray-600">写真をドラッグ＆ドロップ</p>
          <p className="text-xs text-gray-400 mt-1">
            アップロード時に自動で低画質＋透かし版を生成します
          </p>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold text-gray-700 mb-3">透かし設定</h3>
        <div className="flex gap-3 items-center">
          <input
            type="text"
            defaultValue="© VLS System"
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm"
          />
          <Button size="sm" variant="secondary">更新</Button>
        </div>
      </Card>
    </div>
  );
}

function CompaniesTab() {
  const TIER_COLORS: Record<string, string> = {
    platinum: "bg-blue-100 text-blue-700",
    gold: "bg-yellow-100 text-yellow-700",
    silver: "bg-gray-100 text-gray-600",
    bronze: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-4" data-testid="admin-companies">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-bold text-gray-800">パートナー企業</h2>
        <Button size="sm">+ 企業追加</Button>
      </div>
      {COMPANIES.map((c) => (
        <Card key={c.id}>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.logoUrl} alt={c.name} className="w-12 h-12 rounded-full" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-bold text-gray-700">{c.name}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                  {c.tier}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                タグ: {c.tags.join(", ")}
              </p>
              <div className="flex gap-2 mt-2">
                <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">CM15s ✓</span>
                <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">CM30s ✓</span>
                <span className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">CM60s ✓</span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function SurveyTab() {
  return (
    <div className="space-y-4" data-testid="admin-survey">
      <h2 className="text-lg font-bold text-gray-800">アンケート設定</h2>
      {DEFAULT_SURVEY.map((q, i) => (
        <Card key={q.id}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs bg-[#6EC6FF] text-white w-6 h-6 rounded-full flex items-center justify-center font-bold">
              {i + 1}
            </span>
            <input
              type="text"
              defaultValue={q.question}
              className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm font-medium"
            />
          </div>
          <div className="flex flex-wrap gap-2 ml-8">
            {q.options.map((opt) => (
              <span
                key={opt.tag}
                className="text-xs bg-gray-50 border border-gray-200 px-3 py-1 rounded-full text-gray-600"
              >
                {opt.label}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 ml-8 mt-1">
            最大選択数: {q.maxSelections}
          </p>
        </Card>
      ))}
    </div>
  );
}
