"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import AdminHeader from "@/components/admin/AdminHeader";
import Card from "@/components/ui/Card";
import {
  getStoredSegments,
  addSegment,
  deleteSegment,
  getStoredCampaigns,
  addCampaign,
  getStoredEvents,
  getStoredAnalytics,
  getStoredParticipants,
  getStoredVideoPlays,
  getStoredNpsResponses,
  getStoredBehaviorEvents,
  getStoredOfferInteractions,
  getEventsForTenant,
  getAnalyticsForTenant,
  getParticipantsForTenant,
  getVideoPlaysForTenant,
  getNpsForTenant,
} from "@/lib/store";
import {
  calculateEngagementScores,
  getEngagementTier,
} from "@/lib/engagement";
import { csrfHeaders } from "@/lib/csrf";
import type {
  Segment,
  SegmentCondition,
  SegmentConditionType,
  Campaign,
  CampaignChannel,
  InterestTag,
  AnalyticsRecord,
  EngagementScore,
  EventData,
} from "@/lib/types";

// ─── Constants ──────────────────────────────────────────────

const CONDITION_TYPES: { type: SegmentConditionType; label: string; icon: string }[] = [
  { type: "score_range", label: "スコア範囲", icon: "📊" },
  { type: "survey_tag", label: "アンケートタグ", icon: "🏷️" },
  { type: "event", label: "イベント", icon: "📅" },
  { type: "checked_in", label: "チェックイン済み", icon: "✅" },
  { type: "downloaded", label: "写真DL済み", icon: "⬇️" },
  { type: "cm_viewed", label: "CM視聴済み", icon: "🎬" },
  { type: "nps_responded", label: "NPS回答済み", icon: "⭐" },
];

const TAG_OPTIONS: { value: InterestTag; label: string }[] = [
  { value: "education", label: "教育" },
  { value: "sports", label: "スポーツ" },
  { value: "food", label: "フード" },
  { value: "travel", label: "旅行" },
  { value: "technology", label: "テクノロジー" },
  { value: "art", label: "アート" },
  { value: "nature", label: "自然" },
  { value: "cram_school", label: "学習塾" },
  { value: "lessons", label: "習い事" },
  { value: "food_product", label: "食品" },
  { value: "travel_service", label: "旅行サービス" },
  { value: "smartphone", label: "スマホ" },
  { value: "camera", label: "カメラ" },
  { value: "insurance", label: "保険" },
  { value: "age_0_3", label: "0-3歳" },
  { value: "age_4_6", label: "4-6歳" },
  { value: "age_7_9", label: "7-9歳" },
  { value: "age_10_12", label: "10-12歳" },
  { value: "age_13_plus", label: "13歳以上" },
];

const inputCls =
  "w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#6EC6FF] dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100";

type TabKey = "segments" | "create" | "campaigns";

// ─── Segment matcher ────────────────────────────────────────

function matchesSegment(
  rec: AnalyticsRecord,
  conditions: SegmentCondition[],
  scores: Map<string, EngagementScore>,
  npsRespondedIds: Set<string>,
  checkedInParticipants: Set<string>,
): boolean {
  for (const cond of conditions) {
    switch (cond.type) {
      case "score_range": {
        const score = scores.get(rec.id);
        if (!score) return false;
        if (cond.scoreMin != null && score.totalScore < cond.scoreMin) return false;
        if (cond.scoreMax != null && score.totalScore > cond.scoreMax) return false;
        break;
      }
      case "survey_tag": {
        if (!cond.tag) break;
        const answers = rec.surveyAnswers;
        if (!answers) return false;
        const allTags = Object.values(answers).flat();
        if (!allTags.includes(cond.tag)) return false;
        break;
      }
      case "event": {
        if (cond.eventId && rec.eventId !== cond.eventId) return false;
        break;
      }
      case "checked_in": {
        const key = `${rec.eventId}:${rec.respondentName || ""}`;
        const isCheckedIn = checkedInParticipants.has(key);
        if (cond.value !== undefined && isCheckedIn !== cond.value) return false;
        break;
      }
      case "downloaded": {
        if (cond.value !== undefined && rec.stepsCompleted.downloaded !== cond.value) return false;
        break;
      }
      case "cm_viewed": {
        if (cond.value !== undefined && rec.stepsCompleted.cmViewed !== cond.value) return false;
        break;
      }
      case "nps_responded": {
        const name = rec.respondentName || "";
        const hasNps = npsRespondedIds.has(`${rec.eventId}:${name}`);
        if (cond.value !== undefined && hasNps !== cond.value) return false;
        break;
      }
    }
  }
  return true;
}

// ─── Page component ─────────────────────────────────────────

export default function SegmentsPage() {
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<TabKey>("segments");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Create form
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formConditions, setFormConditions] = useState<SegmentCondition[]>([]);

  // Campaign send dialog
  const [sendSegment, setSendSegment] = useState<Segment | null>(null);
  const [sendChannel, setSendChannel] = useState<CampaignChannel>("email");
  const [sendTitle, setSendTitle] = useState("");
  const [sendBody, setSendBody] = useState("");
  const [sending, setSending] = useState(false);

  const tenantId =
    session?.user?.tenantId ??
    (typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null) ??
    null;

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const reload = useCallback(() => {
    const allSegments = getStoredSegments();
    setSegments(tenantId ? allSegments.filter((s) => s.tenantId === tenantId) : allSegments);
    setCampaigns(getStoredCampaigns());
    const allEvents = getStoredEvents();
    setEvents(tenantId ? allEvents.filter((e) => e.tenantId === tenantId) : allEvents);
  }, [tenantId]);

  useEffect(() => {
    if (status === "authenticated") reload();
  }, [status, reload]);

  // ─── Engagement + matching data (memoized) ───

  const { engagementMap, npsRespondedIds, checkedInMap, analytics } = useMemo(() => {
    const allAnalytics = tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics();
    const allEvents = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    const allVideos = tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays();
    const allNps = tenantId ? getNpsForTenant(tenantId) : getStoredNpsResponses();
    const allParticipants = tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants();
    const allBehavior = getStoredBehaviorEvents();
    const allOffers = getStoredOfferInteractions();

    const scores = calculateEngagementScores({
      analytics: allAnalytics,
      videoPlays: allVideos,
      behaviorEvents: allBehavior,
      npsResponses: allNps,
      offerInteractions: allOffers,
      events: allEvents,
    });

    const scoreMap = new Map(scores.map((s) => [s.analyticsId, s]));

    const npsIds = new Set<string>();
    for (const n of allNps) {
      if (n.score != null) npsIds.add(`${n.eventId}:${n.participantName}`);
    }

    const checkedIn = new Set<string>();
    for (const p of allParticipants) {
      if (p.checkedIn) checkedIn.add(`${p.eventId}:${p.name}`);
    }

    return {
      engagementMap: scoreMap,
      npsRespondedIds: npsIds,
      checkedInMap: checkedIn,
      analytics: allAnalytics,
    };
  }, [tenantId]);

  // ─── Preview matching participants ───

  const getMatchingRecords = useCallback(
    (conditions: SegmentCondition[]): AnalyticsRecord[] => {
      if (conditions.length === 0) return [];
      return analytics.filter((rec) =>
        matchesSegment(rec, conditions, engagementMap, npsRespondedIds, checkedInMap),
      );
    },
    [analytics, engagementMap, npsRespondedIds, checkedInMap],
  );

  const previewCount = useMemo(
    () => getMatchingRecords(formConditions).length,
    [formConditions, getMatchingRecords],
  );

  // ─── Condition builder ───

  const addCondition = (type: SegmentConditionType) => {
    const cond: SegmentCondition = { type };
    if (type === "score_range") {
      cond.scoreMin = 0;
      cond.scoreMax = 100;
    }
    if (type === "checked_in" || type === "downloaded" || type === "cm_viewed" || type === "nps_responded") {
      cond.value = true;
    }
    setFormConditions([...formConditions, cond]);
  };

  const updateCondition = (idx: number, update: Partial<SegmentCondition>) => {
    setFormConditions(formConditions.map((c, i) => (i === idx ? { ...c, ...update } : c)));
  };

  const removeCondition = (idx: number) => {
    setFormConditions(formConditions.filter((_, i) => i !== idx));
  };

  // ─── CRUD ───

  const handleCreate = () => {
    if (!formName.trim()) {
      showToast("セグメント名は必須です", "error");
      return;
    }
    if (formConditions.length === 0) {
      showToast("条件を1つ以上追加してください", "error");
      return;
    }
    const seg: Segment = {
      id: `seg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: formName.trim(),
      description: formDescription.trim() || undefined,
      conditions: formConditions,
      tenantId: tenantId || undefined,
      createdAt: Date.now(),
      createdBy: session?.user?.name ?? "admin",
    };
    addSegment(seg);
    setFormName("");
    setFormDescription("");
    setFormConditions([]);
    reload();
    showToast(`セグメント「${seg.name}」を作成しました`);
    setTab("segments");
  };

  const handleDelete = (seg: Segment) => {
    if (!confirm(`セグメント「${seg.name}」を削除しますか？`)) return;
    deleteSegment(seg.id);
    reload();
    showToast(`セグメント「${seg.name}」を削除しました`);
  };

  // ─── Campaign send ───

  const handleSend = useCallback(async () => {
    if (!sendSegment || !sendTitle.trim() || !sendBody.trim()) {
      showToast("タイトルと本文は必須です", "error");
      return;
    }
    setSending(true);

    const matchedRecords = getMatchingRecords(sendSegment.conditions);
    const targetCount = matchedRecords.length;
    let sentCount = 0;
    let failCount = 0;

    try {
      if (sendChannel === "email") {
        // Send via /api/notify for each matched participant with email
        const participants = tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants();
        const emailMap = new Map(participants.filter((p) => p.email).map((p) => [p.name, p.email]));

        for (const rec of matchedRecords) {
          const email = emailMap.get(rec.respondentName || "");
          if (!email) { failCount++; continue; }

          try {
            const res = await fetch("/api/notify", {
              method: "POST",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({
                to: email,
                eventName: sendTitle,
                type: "registration",
                participantName: rec.respondentName || "参加者",
              }),
            });
            if (res.ok) sentCount++;
            else failCount++;
          } catch {
            failCount++;
          }
        }
      } else {
        // Push via /api/push-send
        try {
          const res = await fetch("/api/push-send", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              title: sendTitle,
              body: sendBody,
              trigger: "custom",
            }),
          });
          if (res.ok) {
            const data = await res.json();
            sentCount = data.successCount ?? targetCount;
            failCount = data.failCount ?? 0;
          } else {
            failCount = targetCount;
          }
        } catch {
          failCount = targetCount;
        }
      }

      const campaign: Campaign = {
        id: `camp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        segmentId: sendSegment.id,
        segmentName: sendSegment.name,
        channel: sendChannel,
        title: sendTitle,
        body: sendBody,
        targetCount,
        sentCount,
        failCount,
        status: sentCount > 0 ? "sent" : "failed",
        tenantId: tenantId || undefined,
        sentAt: Date.now(),
        sentBy: session?.user?.name ?? "admin",
      };
      addCampaign(campaign);
      reload();
      setSendSegment(null);
      setSendTitle("");
      setSendBody("");
      showToast(`キャンペーン送信完了: ${sentCount}件成功 / ${failCount}件失敗`);
    } catch (err) {
      showToast(`送信失敗: ${err instanceof Error ? err.message : "エラー"}`, "error");
    } finally {
      setSending(false);
    }
  }, [sendSegment, sendChannel, sendTitle, sendBody, tenantId, session?.user?.name, getMatchingRecords, reload, showToast]);

  // ─── Render helpers ───

  const conditionLabel = (cond: SegmentCondition): string => {
    switch (cond.type) {
      case "score_range":
        return `スコア ${cond.scoreMin ?? 0}〜${cond.scoreMax ?? 100}`;
      case "survey_tag": {
        const tag = TAG_OPTIONS.find((t) => t.value === cond.tag);
        return `タグ: ${tag?.label ?? cond.tag}`;
      }
      case "event": {
        const ev = events.find((e) => e.id === cond.eventId);
        return `イベント: ${ev?.name ?? cond.eventId}`;
      }
      case "checked_in":
        return cond.value ? "チェックイン済み" : "未チェックイン";
      case "downloaded":
        return cond.value ? "DL済み" : "未DL";
      case "cm_viewed":
        return cond.value ? "CM視聴済み" : "CM未視聴";
      case "nps_responded":
        return cond.value ? "NPS回答済み" : "NPS未回答";
      default:
        return cond.type;
    }
  };

  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full bg-[#6EC6FF] animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500">読み込み中...</p>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    if (typeof window !== "undefined") window.location.href = "/admin";
    return null;
  }

  const tabBtnCls = (key: TabKey) =>
    `text-sm px-4 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
      tab === key
        ? "bg-[#6EC6FF] text-white shadow-sm"
        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
    }`;

  return (
    <main className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AdminHeader
        title="参加者セグメント"
        badge={`${segments.length}件`}
        onLogout={() => { sessionStorage.removeItem("adminTenantId"); signOut({ redirect: false }); }}
      />

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Toast */}
        {toast && (
          <div role="status" aria-live="polite"
            className={`px-4 py-2 rounded-xl text-sm text-center border ${
              toast.type === "success"
                ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
                : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
            }`}>
            {toast.message}
          </div>
        )}

        {/* KPI */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><p className="text-xs text-gray-500 dark:text-gray-400 font-medium">セグメント数</p><p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">{segments.length}</p></Card>
          <Card><p className="text-xs text-gray-500 dark:text-gray-400 font-medium">全参加者</p><p className="text-2xl font-bold text-gray-800 dark:text-gray-100 mt-1">{analytics.length}</p></Card>
          <Card><p className="text-xs text-gray-500 dark:text-gray-400 font-medium">キャンペーン送信数</p><p className="text-2xl font-bold text-[#6EC6FF] mt-1">{campaigns.length}</p></Card>
          <Card><p className="text-xs text-gray-500 dark:text-gray-400 font-medium">総配信数</p><p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">{campaigns.reduce((s, c) => s + c.sentCount, 0)}</p></Card>
        </div>

        {/* Tabs */}
        <div className="flex gap-2" role="tablist" aria-label="セグメントタブ">
          <button role="tab" aria-selected={tab === "segments"} className={tabBtnCls("segments")} onClick={() => setTab("segments")}>セグメント一覧</button>
          <button role="tab" aria-selected={tab === "create"} className={tabBtnCls("create")} onClick={() => setTab("create")}>新規作成</button>
          <button role="tab" aria-selected={tab === "campaigns"} className={tabBtnCls("campaigns")} onClick={() => setTab("campaigns")}>キャンペーン履歴</button>
        </div>

        {/* ═══ Segments List ═══ */}
        {tab === "segments" && (
          <div role="tabpanel">
            {segments.length === 0 ? (
              <Card>
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  セグメントがありません。「新規作成」タブからセグメントを作成してください。
                </p>
              </Card>
            ) : (
              <div className="space-y-3">
                {segments.map((seg) => {
                  const matched = getMatchingRecords(seg.conditions);
                  return (
                    <Card key={seg.id}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">{seg.name}</h3>
                            <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-medium">
                              {matched.length}名
                            </span>
                          </div>
                          {seg.description && (
                            <p className="text-[10px] text-gray-400 mb-2">{seg.description}</p>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            {seg.conditions.map((cond, i) => (
                              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                                {conditionLabel(cond)}
                              </span>
                            ))}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-2">
                            作成: {new Date(seg.createdAt).toLocaleDateString("ja-JP")} by {seg.createdBy}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => {
                              setSendSegment(seg);
                              setSendTitle(`[VLS] ${seg.name} 向けお知らせ`);
                              setSendBody("");
                            }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                            aria-label={`${seg.name}にキャンペーン送信`}
                          >
                            配信
                          </button>
                          <button
                            onClick={() => handleDelete(seg)}
                            className="text-xs text-red-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                            aria-label={`${seg.name}を削除`}
                          >
                            削除
                          </button>
                        </div>
                      </div>

                      {/* Preview first 5 participants */}
                      {matched.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                          <p className="text-[10px] text-gray-400 mb-1.5 font-medium">対象者プレビュー (最大5名)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {matched.slice(0, 5).map((rec) => {
                              const score = engagementMap.get(rec.id);
                              return (
                                <span key={rec.id} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600">
                                  {rec.respondentName || "匿名"}
                                  {score && (
                                    <span className={`ml-1 font-bold ${score.totalScore >= 70 ? "text-green-500" : score.totalScore >= 40 ? "text-yellow-500" : "text-gray-400"}`}>
                                      {score.totalScore}pt ({getEngagementTier(score.totalScore)})
                                    </span>
                                  )}
                                </span>
                              );
                            })}
                            {matched.length > 5 && (
                              <span className="text-[10px] text-gray-400">+{matched.length - 5}名</span>
                            )}
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ Create Segment ═══ */}
        {tab === "create" && (
          <div role="tabpanel">
            <Card>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">セグメント作成</h2>

              <div className="space-y-4">
                {/* Name */}
                <div>
                  <label htmlFor="seg-name" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">セグメント名 *</label>
                  <input id="seg-name" className={inputCls} placeholder="例: 高エンゲージメント・DL完了者" value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>

                {/* Description */}
                <div>
                  <label htmlFor="seg-desc" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">説明</label>
                  <input id="seg-desc" className={inputCls} placeholder="任意の説明メモ" value={formDescription} onChange={(e) => setFormDescription(e.target.value)} />
                </div>

                {/* Conditions */}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-2">条件 (AND結合)</p>

                  {formConditions.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {formConditions.map((cond, idx) => (
                        <div key={idx} className="flex items-center gap-2 p-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                          <span className="text-sm">{CONDITION_TYPES.find((c) => c.type === cond.type)?.icon}</span>
                          <span className="text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">
                            {CONDITION_TYPES.find((c) => c.type === cond.type)?.label}
                          </span>

                          {/* Type-specific inputs */}
                          {cond.type === "score_range" && (
                            <div className="flex items-center gap-1.5">
                              <input type="number" min={0} max={100} value={cond.scoreMin ?? 0} onChange={(e) => updateCondition(idx, { scoreMin: Number(e.target.value) })}
                                className="w-16 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#6EC6FF]" aria-label="最小スコア" />
                              <span className="text-xs text-gray-400">〜</span>
                              <input type="number" min={0} max={100} value={cond.scoreMax ?? 100} onChange={(e) => updateCondition(idx, { scoreMax: Number(e.target.value) })}
                                className="w-16 text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#6EC6FF]" aria-label="最大スコア" />
                            </div>
                          )}

                          {cond.type === "survey_tag" && (
                            <select value={cond.tag || ""} onChange={(e) => updateCondition(idx, { tag: e.target.value as InterestTag })}
                              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#6EC6FF]" aria-label="タグ選択">
                              <option value="">-- 選択 --</option>
                              {TAG_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          )}

                          {cond.type === "event" && (
                            <select value={cond.eventId || ""} onChange={(e) => updateCondition(idx, { eventId: e.target.value })}
                              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#6EC6FF]" aria-label="イベント選択">
                              <option value="">-- 全イベント --</option>
                              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                            </select>
                          )}

                          {(cond.type === "checked_in" || cond.type === "downloaded" || cond.type === "cm_viewed" || cond.type === "nps_responded") && (
                            <select value={cond.value ? "true" : "false"} onChange={(e) => updateCondition(idx, { value: e.target.value === "true" })}
                              className="text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#6EC6FF]" aria-label="条件値">
                              <option value="true">はい</option>
                              <option value="false">いいえ</option>
                            </select>
                          )}

                          <button onClick={() => removeCondition(idx)} className="ml-auto text-xs text-red-400 hover:text-red-600 focus:outline-none" aria-label="条件を削除">✕</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add condition buttons */}
                  <div className="flex flex-wrap gap-1.5">
                    {CONDITION_TYPES.map((ct) => (
                      <button key={ct.type} onClick={() => addCondition(ct.type)}
                        className="text-[10px] px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">
                        {ct.icon} {ct.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Preview */}
                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">
                    プレビュー: <span className="text-base font-bold">{previewCount}</span> 名がマッチ
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <button onClick={handleCreate} aria-label="セグメント作成"
                    className="text-sm px-5 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">
                    セグメントを作成
                  </button>
                  <button onClick={() => { setFormName(""); setFormDescription(""); setFormConditions([]); }} aria-label="フォームリセット"
                    className="text-sm px-5 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">
                    リセット
                  </button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ═══ Campaign History ═══ */}
        {tab === "campaigns" && (
          <div role="tabpanel">
            <Card>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">キャンペーン履歴</h2>
              {campaigns.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  キャンペーン履歴がありません。セグメントから「配信」ボタンでキャンペーンを送信できます。
                </p>
              ) : (
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-sm" aria-label="キャンペーン履歴">
                    <thead>
                      <tr className="border-b border-gray-200 dark:border-gray-700 text-left">
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">状態</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">チャネル</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">セグメント</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">タイトル</th>
                        <th className="pb-2 pr-3 text-xs font-medium text-gray-500 dark:text-gray-400">配信</th>
                        <th className="pb-2 text-xs font-medium text-gray-500 dark:text-gray-400">送信日時</th>
                      </tr>
                    </thead>
                    <tbody>
                      {campaigns.map((c) => (
                        <tr key={c.id} className="border-b border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                          <td className="py-2.5 pr-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              c.status === "sent"
                                ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : c.status === "failed"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            }`}>
                              {c.status === "sent" ? "送信済" : c.status === "failed" ? "失敗" : "下書き"}
                            </span>
                          </td>
                          <td className="py-2.5 pr-3 text-xs">
                            {c.channel === "email" ? "📧 メール" : "🔔 Push"}
                          </td>
                          <td className="py-2.5 pr-3 text-xs font-medium text-gray-700 dark:text-gray-200 whitespace-nowrap">{c.segmentName}</td>
                          <td className="py-2.5 pr-3 text-xs text-gray-600 dark:text-gray-300 max-w-[200px] truncate">{c.title}</td>
                          <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                            <span className="text-green-600 dark:text-green-400 font-bold">{c.sentCount}</span>
                            <span className="text-gray-400">/{c.targetCount}</span>
                            {c.failCount > 0 && <span className="text-red-400 ml-1">({c.failCount}失敗)</span>}
                          </td>
                          <td className="py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap font-mono">
                            {new Date(c.sentAt).toLocaleString("ja-JP")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>

      {/* ═══ Campaign Send Dialog ═══ */}
      {sendSegment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !sending && setSendSegment(null)}>
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="send-title">
            <h3 id="send-title" className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">キャンペーン配信</h3>
            <p className="text-xs text-gray-400 mb-4">
              セグメント「{sendSegment.name}」 — {getMatchingRecords(sendSegment.conditions).length}名対象
            </p>

            <div className="space-y-3">
              {/* Channel */}
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">チャネル</label>
                <div className="flex gap-2">
                  {(["email", "push"] as CampaignChannel[]).map((ch) => (
                    <button key={ch} onClick={() => setSendChannel(ch)} aria-pressed={sendChannel === ch}
                      className={`flex-1 text-xs px-3 py-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                        sendChannel === ch ? "bg-[#6EC6FF] text-white" : "border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400"
                      }`}>
                      {ch === "email" ? "📧 メール" : "🔔 Push通知"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label htmlFor="send-title-input" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">タイトル *</label>
                <input id="send-title-input" className={inputCls} value={sendTitle} onChange={(e) => setSendTitle(e.target.value)} />
              </div>

              {/* Body */}
              <div>
                <label htmlFor="send-body" className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-1 block">本文 *</label>
                <textarea id="send-body" rows={3} className={inputCls} value={sendBody} onChange={(e) => setSendBody(e.target.value)} placeholder="配信メッセージ本文..." />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-5">
              <button onClick={() => setSendSegment(null)} disabled={sending}
                className="text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]">
                キャンセル
              </button>
              <button onClick={handleSend} disabled={sending || !sendTitle.trim() || !sendBody.trim()}
                className="text-xs px-4 py-2 rounded-lg bg-[#6EC6FF] text-white hover:bg-blue-400 font-bold disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] flex items-center gap-2">
                {sending ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    送信中...
                  </>
                ) : "配信実行"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
