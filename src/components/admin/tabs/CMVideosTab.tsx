"use client";

import { useEffect, useMemo, useState } from "react";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { Company, CompanyTier } from "@/lib/types";
import { getStoredCompanies, setStoredCompanies } from "@/lib/store";
import { inputCls, TIER_COLORS, extractYouTubeId } from "./adminUtils";
import { COMPANIES } from "@/lib/data";

interface Props {
  onSave: (msg: string) => void;
}

type StatusFilter = "all" | "complete" | "partial" | "none";

const TIER_ORDER: CompanyTier[] = ["platinum", "gold", "silver", "bronze"];

const YT_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

function isValidYouTubeId(id: string): boolean {
  return id === "" || YT_ID_RE.test(id);
}

function videoStatus(c: Company): StatusFilter {
  const has15 = !!c.videos.cm15;
  const has30 = !!c.videos.cm30;
  const has60 = !!c.videos.cm60;
  if (has15 && has30 && has60) return "complete";
  if (!has15 && !has30 && !has60) return "none";
  return "partial";
}

export default function CMVideosTab({ onSave }: Props) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [tierFilter, setTierFilter] = useState<CompanyTier | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ cm15: "", cm30: "", cm60: "" });
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [thumbErrors, setThumbErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    setCompanies(getStoredCompanies());
  }, []);

  const resetToDefaults = () => {
    const defaultMap = new Map(COMPANIES.map((c) => [c.id, c.videos]));
    const updated = companies.map((c) => {
      const def = defaultMap.get(c.id);
      return def ? { ...c, videos: { ...def } } : c;
    });
    setStoredCompanies(updated);
    setCompanies(updated);
    onSave("全企業のCM動画をデフォルトにリセットしました");
  };

  const sorted = useMemo(() => {
    return [...companies].sort(
      (a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier)
    );
  }, [companies]);

  const filtered = useMemo(() => {
    return sorted.filter((c) => {
      if (tierFilter !== "all" && c.tier !== tierFilter) return false;
      if (statusFilter !== "all" && videoStatus(c) !== statusFilter) return false;
      return true;
    });
  }, [sorted, tierFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = companies.length;
    const complete = companies.filter((c) => videoStatus(c) === "complete").length;
    const partial = companies.filter((c) => videoStatus(c) === "partial").length;
    const none = companies.filter((c) => videoStatus(c) === "none").length;
    return { total, complete, partial, none };
  }, [companies]);

  const startEdit = (c: Company) => {
    setExpandedId(c.id);
    setForm({ cm15: c.videos.cm15, cm30: c.videos.cm30, cm60: c.videos.cm60 });
    setPreviewId(null);
  };

  const cancelEdit = () => {
    setExpandedId(null);
    setPreviewId(null);
  };

  const save = () => {
    if (!expandedId) return;
    if (!isValidYouTubeId(form.cm15) || !isValidYouTubeId(form.cm30) || !isValidYouTubeId(form.cm60)) return;
    const updated = companies.map((c) =>
      c.id === expandedId
        ? { ...c, videos: { cm15: form.cm15.trim(), cm30: form.cm30.trim(), cm60: form.cm60.trim() } }
        : c
    );
    setStoredCompanies(updated);
    setCompanies(updated);
    setExpandedId(null);
    setPreviewId(null);
    onSave("CM動画を保存しました");
  };

  const validationError = (id: string): string | null => {
    if (id === "" || YT_ID_RE.test(id)) return null;
    return "YouTube IDは11文字（英数字・ハイフン・アンダースコア）";
  };

  return (
    <div className="space-y-4" data-testid="admin-cmvideos">
      {/* Stats summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="text-center py-3 rounded-xl bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
          <p className="text-lg font-bold text-green-700 dark:text-green-400">{stats.complete}</p>
          <p className="text-[10px] text-green-600 dark:text-green-500 font-medium">全設定済</p>
        </div>
        <div className="text-center py-3 rounded-xl bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800">
          <p className="text-lg font-bold text-yellow-700 dark:text-yellow-400">{stats.partial}</p>
          <p className="text-[10px] text-yellow-600 dark:text-yellow-500 font-medium">一部未設定</p>
        </div>
        <div className="text-center py-3 rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800">
          <p className="text-lg font-bold text-red-700 dark:text-red-400">{stats.none}</p>
          <p className="text-[10px] text-red-600 dark:text-red-500 font-medium">未設定</p>
        </div>
        <div className="text-center py-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800">
          <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{stats.total}</p>
          <p className="text-[10px] text-blue-600 dark:text-blue-500 font-medium">全企業</p>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label htmlFor="cm-tier-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">Tier:</label>
            <select
              id="cm-tier-filter"
              className={inputCls + " !w-auto dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"}
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value as CompanyTier | "all")}
            >
              <option value="all">すべて</option>
              <option value="platinum">Platinum</option>
              <option value="gold">Gold</option>
              <option value="silver">Silver</option>
              <option value="bronze">Bronze</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="cm-status-filter" className="text-xs font-medium text-gray-600 dark:text-gray-400">状態:</label>
            <select
              id="cm-status-filter"
              className={inputCls + " !w-auto dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="all">すべて</option>
              <option value="complete">全設定済</option>
              <option value="partial">一部未設定</option>
              <option value="none">未設定</option>
            </select>
          </div>
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto">
            {filtered.length} / {companies.length} 社
          </span>
          <button
            onClick={() => {
              if (window.confirm("全企業のCM動画をデフォルト値にリセットしますか？")) {
                resetToDefaults();
              }
            }}
            className="text-[10px] px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
            aria-label="CM動画をデフォルトにリセット"
          >
            デフォルトに戻す
          </button>
        </div>
      </Card>

      {/* Company video list */}
      {filtered.map((c) => {
        const isExpanded = expandedId === c.id;
        const status = videoStatus(c);
        const statusBadge =
          status === "complete"
            ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-600 dark:text-green-400"
            : status === "partial"
            ? "bg-yellow-50 dark:bg-yellow-900/30 border-yellow-200 dark:border-yellow-800 text-yellow-600 dark:text-yellow-400"
            : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400";
        const statusLabel = status === "complete" ? "全設定済" : status === "partial" ? "一部未設定" : "未設定";

        return (
          <Card key={c.id}>
            {/* Header row */}
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.logoUrl} alt={c.name} className="w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-700 dark:text-gray-200 truncate">{c.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${TIER_COLORS[c.tier]}`}>
                    {c.tier}
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge}`}>
                    {statusLabel}
                  </span>
                </div>
                {/* Thumbnail previews */}
                {!isExpanded && (
                  <div className="flex gap-2 mt-2">
                    {(["cm15", "cm30", "cm60"] as const).map((key) => {
                      const vid = c.videos[key];
                      const label = key === "cm15" ? "15s" : key === "cm30" ? "30s" : "60s";
                      const thumbKey = `${c.id}-${key}`;
                      return (
                        <div key={key} className="text-center">
                          {vid && !thumbErrors.has(thumbKey) ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={`https://img.youtube.com/vi/${vid}/mqdefault.jpg`}
                              alt={`${c.name} ${label}`}
                              className="w-24 h-14 rounded object-cover border border-gray-200 dark:border-gray-600"
                              onError={() => setThumbErrors((prev) => new Set(prev).add(thumbKey))}
                            />
                          ) : vid ? (
                            <div className="w-24 h-14 rounded border border-dashed border-red-300 dark:border-red-600 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
                              <span className="text-[10px] text-red-400 dark:text-red-500">取得不可</span>
                            </div>
                          ) : (
                            <div className="w-24 h-14 rounded border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
                              <span className="text-[10px] text-gray-400 dark:text-gray-500">未設定</span>
                            </div>
                          )}
                          <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
              <button
                onClick={() => (isExpanded ? cancelEdit() : startEdit(c))}
                className="text-xs text-[#6EC6FF] hover:underline flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
                aria-label={isExpanded ? `${c.name}の編集を閉じる` : `${c.name}のCM動画を編集`}
              >
                {isExpanded ? "閉じる" : "編集"}
              </button>
            </div>

            {/* Expanded edit form */}
            {isExpanded && (
              <div className="mt-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                {(["cm15", "cm30", "cm60"] as const).map((key) => {
                  const label = key === "cm15" ? "15秒CM" : key === "cm30" ? "30秒CM" : "60秒CM";
                  const val = form[key];
                  const err = validationError(val);
                  return (
                    <div key={key}>
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">{label}</label>
                      <div className="flex gap-2 items-start">
                        <div className="flex-1">
                          <input
                            className={`${inputCls} font-mono dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100 ${err ? "!border-red-400" : ""}`}
                            placeholder="YouTube URLまたはID（例: dQw4w9WgXcQ）"
                            value={val}
                            onChange={(e) => setForm({ ...form, [key]: extractYouTubeId(e.target.value) })}
                          />
                          {err && <p className="text-[10px] text-red-500 mt-0.5">{err}</p>}
                        </div>
                        {val && isValidYouTubeId(val) && (
                          <button
                            onClick={() => setPreviewId(previewId === `${c.id}-${key}` ? null : `${c.id}-${key}`)}
                            className="text-[10px] px-2 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                            aria-label={`${label}をプレビュー`}
                          >
                            {previewId === `${c.id}-${key}` ? "閉じる" : "再生"}
                          </button>
                        )}
                      </div>
                      {/* Thumbnail + preview embed */}
                      {val && isValidYouTubeId(val) && (
                        <div className="mt-2">
                          {previewId === `${c.id}-${key}` ? (
                            <iframe
                              src={`https://www.youtube.com/embed/${val}`}
                              title={`${c.name} ${label} プレビュー`}
                              className="w-full max-w-md h-56 rounded-lg border border-gray-200 dark:border-gray-600"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          ) : !thumbErrors.has(`edit-${c.id}-${key}`) ? (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img
                              src={`https://img.youtube.com/vi/${val}/mqdefault.jpg`}
                              alt={`${label} サムネイル`}
                              className="w-32 h-18 rounded border border-gray-200 dark:border-gray-600 object-cover"
                              onError={() => setThumbErrors((prev) => new Set(prev).add(`edit-${c.id}-${key}`))}
                            />
                          ) : (
                            <div className="w-32 h-18 rounded border border-dashed border-red-300 dark:border-red-600 flex items-center justify-center bg-red-50 dark:bg-red-900/20">
                              <span className="text-[10px] text-red-400">サムネイル取得不可</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" onClick={save}>保存</Button>
                  <Button size="sm" variant="secondary" onClick={cancelEdit}>キャンセル</Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {filtered.length === 0 && (
        <Card>
          <p className="text-center text-sm text-gray-400 dark:text-gray-500 py-4">
            条件に一致する企業がありません
          </p>
        </Card>
      )}
    </div>
  );
}
