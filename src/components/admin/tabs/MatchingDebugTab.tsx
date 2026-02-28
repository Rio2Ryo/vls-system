"use client";

import { useState } from "react";
import Card from "@/components/ui/Card";
import { CMMatchResult, InterestTag } from "@/lib/types";
import { getStoredEvents } from "@/lib/store";
import { getCMMatch } from "@/lib/matching";
import { inputCls } from "./adminUtils";

const TAG_GROUPS: { label: string; tags: { tag: InterestTag; label: string }[] }[] = [
  {
    label: "テーマ (Q1)",
    tags: [
      { tag: "education", label: "教育" },
      { tag: "sports", label: "スポーツ" },
      { tag: "food", label: "食" },
      { tag: "travel", label: "旅行" },
      { tag: "technology", label: "テクノロジー" },
      { tag: "art", label: "アート" },
      { tag: "nature", label: "自然" },
    ],
  },
  {
    label: "サービス (Q2)",
    tags: [
      { tag: "cram_school", label: "学習塾" },
      { tag: "lessons", label: "習い事" },
      { tag: "food_product", label: "食品" },
      { tag: "travel_service", label: "旅行" },
      { tag: "smartphone", label: "スマホ" },
      { tag: "camera", label: "カメラ" },
      { tag: "insurance", label: "保険" },
    ],
  },
  {
    label: "年齢 (Q3)",
    tags: [
      { tag: "age_0_3", label: "0〜3歳" },
      { tag: "age_4_6", label: "4〜6歳" },
      { tag: "age_7_9", label: "7〜9歳" },
      { tag: "age_10_12", label: "10〜12歳" },
      { tag: "age_13_plus", label: "13歳以上" },
    ],
  },
];

const PRESETS: { label: string; tags: InterestTag[] }[] = [
  { label: "教育重視", tags: ["education", "cram_school", "age_4_6"] },
  { label: "スポーツ家族", tags: ["sports", "lessons", "age_7_9"] },
  { label: "テック好き", tags: ["technology", "education", "smartphone", "age_10_12"] },
  { label: "旅行・自然", tags: ["travel", "nature", "travel_service", "age_7_9"] },
  { label: "食 & アート", tags: ["food", "art", "food_product", "age_4_6"] },
  { label: "全タグなし", tags: [] },
];

const TIER_BADGE_COLORS: Record<string, string> = {
  platinum: "bg-blue-100 text-blue-700",
  gold: "bg-yellow-100 text-yellow-700",
  silver: "bg-gray-100 text-gray-600",
  bronze: "bg-orange-100 text-orange-700",
};

export default function MatchingDebugTab() {
  const [selectedTags, setSelectedTags] = useState<InterestTag[]>([]);
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [result, setResult] = useState<CMMatchResult | null>(null);
  const [events] = useState(() => getStoredEvents());

  const toggleTag = (tag: InterestTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const applyPreset = (tags: InterestTag[]) => {
    setSelectedTags(tags);
  };

  const runMatch = () => {
    const eventCompanyIds = eventFilter !== "all"
      ? events.find((e) => e.id === eventFilter)?.companyIds
      : undefined;
    const r = getCMMatch(selectedTags, eventCompanyIds, { includeDebug: true });
    setResult(r);
  };

  const renderScoreBar = (score: number, max: number) => {
    const pct = max > 0 ? Math.min((score / max) * 100, 100) : 0;
    return (
      <div className="w-full bg-gray-100 rounded-full h-3 relative overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-purple-400 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600">
          {score}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="admin-matching">
      <h2 className="text-lg font-bold text-gray-800">マッチングテスト</h2>
      <p className="text-xs text-gray-400">
        アンケート回答タグを選択して、スコアリングベースのマッチング結果を確認できます。
      </p>

      {/* Quick presets */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-2">クイックプリセット</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.tags)}
              className="text-xs px-3 py-1.5 rounded-full bg-purple-50 text-purple-600 hover:bg-purple-100 font-medium transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </Card>

      {/* Tag selector */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-3">タグ選択</p>
        <div className="space-y-4">
          {TAG_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="text-[10px] text-gray-400 font-medium mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {group.tags.map((t) => (
                  <button
                    key={t.tag}
                    onClick={() => toggleTag(t.tag)}
                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                      selectedTags.includes(t.tag)
                        ? "bg-[#6EC6FF] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-gray-400">
          選択中: {selectedTags.length > 0 ? selectedTags.join(", ") : "(なし)"}
        </div>
      </Card>

      {/* Event filter + Run */}
      <Card>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-500 mb-1">イベントフィルター</p>
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className={inputCls}
            >
              <option value="all">全企業（フィルターなし）</option>
              {events.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.name} ({evt.companyIds ? `${evt.companyIds.length}社` : "全社"})
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runMatch}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl font-bold text-sm hover:from-blue-600 hover:to-purple-600 transition-all shadow-md"
            data-testid="matching-run-btn"
          >
            マッチング実行
          </button>
        </div>
      </Card>

      {/* Results */}
      {result && result.debug && (
        <>
          {/* Selected CMs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className={result.platinumCM ? "border-2 border-blue-300" : ""}>
              <p className="text-xs font-bold text-blue-600 mb-2">Platinum CM (15s)</p>
              {result.platinumCM ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.platinumCM.logoUrl} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{result.platinumCM.name}</p>
                    <p className="text-xs text-gray-400">
                      Score: {result.debug.platinumScores[0]?.totalScore ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">Platinum企業なし</p>
              )}
            </Card>
            <Card className={result.matchedCM ? "border-2 border-green-300" : ""}>
              <p className="text-xs font-bold text-green-600 mb-2">Matched CM (30s/60s)</p>
              {result.matchedCM ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={result.matchedCM.logoUrl} alt="" className="w-10 h-10 rounded-full" />
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{result.matchedCM.name}</p>
                    <p className="text-xs text-gray-400">
                      Score: {result.debug.allScores.find((s) => s.companyId === result.matchedCM?.id)?.totalScore ?? 0}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-400">マッチ企業なし</p>
              )}
            </Card>
          </div>

          {/* Reason */}
          <Card>
            <p className="text-xs font-bold text-gray-500 mb-1">マッチング理由</p>
            <p className="text-xs text-gray-600 font-mono bg-gray-50 p-2 rounded-lg">{result.debug.reason}</p>
          </Card>

          {/* Full ranking table */}
          <Card>
            <p className="text-xs font-bold text-gray-500 mb-3">全企業スコアランキング</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs" data-testid="matching-score-table">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-1 text-gray-500">#</th>
                    <th className="text-left py-2 px-1 text-gray-500">企業名</th>
                    <th className="text-center py-2 px-1 text-gray-500">Tier</th>
                    <th className="text-center py-2 px-1 text-gray-500 w-24">総合</th>
                    <th className="text-center py-2 px-1 text-gray-500">タグ</th>
                    <th className="text-center py-2 px-1 text-gray-500">Tier</th>
                    <th className="text-center py-2 px-1 text-gray-500">年齢</th>
                    <th className="text-center py-2 px-1 text-gray-500">幅広</th>
                    <th className="text-left py-2 px-1 text-gray-500">一致タグ</th>
                  </tr>
                </thead>
                <tbody>
                  {result.debug.allScores.map((s, i) => {
                    const isPlatinum = s.companyId === result.platinumCM?.id;
                    const isMatched = s.companyId === result.matchedCM?.id;
                    const rowBg = isPlatinum ? "bg-blue-50" : isMatched ? "bg-green-50" : i % 2 === 0 ? "bg-white" : "bg-gray-50/50";
                    const maxScore = result.debug!.allScores[0]?.totalScore || 1;
                    return (
                      <tr key={s.companyId} className={`${rowBg} border-b border-gray-50`}>
                        <td className="py-2 px-1 font-mono text-gray-400">{i + 1}</td>
                        <td className="py-2 px-1">
                          <span className="font-medium text-gray-700">{s.companyName}</span>
                          {isPlatinum && <span className="ml-1 text-[9px] bg-blue-200 text-blue-700 px-1 rounded">PT</span>}
                          {isMatched && <span className="ml-1 text-[9px] bg-green-200 text-green-700 px-1 rounded">MT</span>}
                        </td>
                        <td className="py-2 px-1 text-center">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase ${TIER_BADGE_COLORS[s.tier]}`}>
                            {s.tier}
                          </span>
                        </td>
                        <td className="py-2 px-1">{renderScoreBar(s.totalScore, maxScore)}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.tagMatchScore}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.tierBonus}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.ageMatchBonus}</td>
                        <td className="py-2 px-1 text-center font-mono">{s.breakdown.categoryBreadth}</td>
                        <td className="py-2 px-1 text-gray-500 text-[10px]">
                          {s.breakdown.tagMatchDetails.length > 0 ? s.breakdown.tagMatchDetails.join(", ") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
