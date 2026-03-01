"use client";

import { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import TagSelector from "@/components/ui/TagSelector";
import ProgressBar from "@/components/ui/ProgressBar";
import VideoPlayer from "@/components/cm/VideoPlayer";
import PhotoGrid from "@/components/photos/PhotoGrid";
import PhotoModal from "@/components/photos/PhotoModal";
import LoadingAnimation from "@/components/ui/LoadingAnimation";
import DemoBanner from "@/components/demo/DemoBanner";
import { EVENTS, DEFAULT_SURVEY, COMPANIES } from "@/lib/data";
import { InterestTag, PhotoData } from "@/lib/types";

// --- Demo constants ---
type Phase = "top" | "survey-name" | "survey-q" | "processing" | "photos" | "downloading" | "complete";

const DEMO_EVENT = EVENTS[0]; // 夏祭り 2026, 12枚
const DEMO_NAME_DEFAULT = "田中太郎";
const DEMO_TIMER = 5; // CM wait shortened to 5 seconds for demo

const PHASE_TO_STEP: Record<Phase, number> = {
  "top": 0,
  "survey-name": 1,
  "survey-q": 2,
  "processing": 3,
  "photos": 4,
  "downloading": 5,
  "complete": 6,
};

const STEPS = [
  { num: 1, title: "アンケート入力", desc: "名前入力 + 3問のアンケート", icon: "📝" },
  { num: 2, title: "CM視聴（スポンサー提供）", desc: "マッチした企業のCM動画を視聴", icon: "🎬" },
  { num: 3, title: "写真選択", desc: "イベント写真をプレビュー・選択", icon: "📷" },
  { num: 4, title: "ダウンロード準備", desc: "高画質データを生成（CM視聴付き）", icon: "⬇️" },
  { num: 5, title: "完了・オファー", desc: "写真DL + スポンサーオファー表示", icon: "🎉" },
];

// Local matching for demo (avoids localStorage dependency from getCMMatch)
function demoCMMatch(userTags: InterestTag[]) {
  const userTagSet = new Set(userTags);
  const platinumCompanies = COMPANIES.filter((c) => c.tier === "platinum");
  const others = COMPANIES.filter((c) => c.tier !== "platinum");

  // Simple scoring: count tag overlaps
  const score = (tags: InterestTag[]) => tags.filter((t) => userTagSet.has(t)).length;

  const sortedPlatinum = [...platinumCompanies].sort((a, b) => score(b.tags) - score(a.tags));
  const sortedOthers = [...others].sort((a, b) => score(b.tags) - score(a.tags));

  return {
    platinumCM: sortedPlatinum[0] ?? null,
    matchedCM: sortedOthers[0] ?? null,
  };
}

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>("top");
  const [respondentName, setRespondentName] = useState(DEMO_NAME_DEFAULT);

  // Survey state
  const [currentQ, setCurrentQ] = useState(0);
  const [allAnswers, setAllAnswers] = useState<Record<string, InterestTag[]>>({});

  // Processing state
  const [procElapsed, setProcElapsed] = useState(0);
  const [procPhase, setProcPhase] = useState<"platinum" | "matched" | "waiting">("platinum");

  // Photo state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);

  // Downloading state
  const [dlElapsed, setDlElapsed] = useState(0);
  const [dlVideoDone, setDlVideoDone] = useState(false);

  // Collect user tags
  const userTags = useMemo(() => Object.values(allAnswers).flat() as InterestTag[], [allAnswers]);

  // CM matching (recomputed when tags change)
  const cmMatch = useMemo(() => demoCMMatch(userTags), [userTags]);

  const resetDemo = () => {
    setPhase("top");
    setRespondentName(DEMO_NAME_DEFAULT);
    setCurrentQ(0);
    setAllAnswers({});
    setProcElapsed(0);
    setProcPhase("platinum");
    setSelectedIds([]);
    setPreviewPhoto(null);
    setDlElapsed(0);
    setDlVideoDone(false);
  };

  // --- Phase: TOP ---
  const renderTop = () => (
    <div className="max-w-lg mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-2xl font-bold text-gray-800">VLS デモ体験</h1>
        <p className="text-gray-400 text-sm mt-2">
          パスワード不要でVLSの画面遷移フローを体験できます
        </p>
        <p className="text-xs text-gray-300 mt-1">
          イベント: {DEMO_EVENT.name} / 写真: {DEMO_EVENT.photos.length}枚
        </p>
      </motion.div>

      <Card>
        <h2 className="text-lg font-bold text-gray-700 mb-4 text-center">ユーザーフロー 5ステップ</h2>
        <div className="space-y-3">
          {STEPS.map((step) => (
            <div key={step.num} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-2xl" aria-hidden="true">{step.icon}</span>
              <div>
                <p className="font-bold text-gray-700 text-sm">
                  Step {step.num}: {step.title}
                </p>
                <p className="text-xs text-gray-400">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="text-center">
        <Button onClick={() => setPhase("survey-name")} size="lg">
          デモを開始する
        </Button>
      </div>

      <p className="text-xs text-gray-300 text-center">
        CM動画の待ち時間は{DEMO_TIMER}秒に短縮されています
      </p>
    </div>
  );

  // --- Phase: SURVEY NAME ---
  const renderSurveyName = () => (
    <div className="max-w-lg mx-auto">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex gap-2 mb-8 justify-center"
      >
        <div className="w-3 h-3 rounded-full bg-[#6EC6FF]" />
        {DEFAULT_SURVEY.map((_, i) => (
          <div key={i} className="w-3 h-3 rounded-full bg-gray-200" />
        ))}
      </motion.div>

      <AnimatePresence mode="wait">
        <motion.div
          key="demo-name-input"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.3 }}
        >
          <Card>
            <h2 className="text-lg font-bold text-gray-700 text-center mb-6">
              お名前を教えてください
            </h2>
            <label htmlFor="demo-name" className="sr-only">お名前</label>
            <input
              id="demo-name"
              type="text"
              value={respondentName}
              onChange={(e) => setRespondentName(e.target.value)}
              placeholder="例: 田中太郎"
              aria-label="お名前"
              className="w-full px-4 py-3 rounded-xl border border-gray-200
                         focus:border-[#6EC6FF] focus:ring-2 focus:ring-blue-100
                         focus:outline-none text-center text-lg bg-gray-50/50"
              onKeyDown={(e) => { if (e.key === "Enter") setPhase("survey-q"); }}
            />
            <p className="text-xs text-gray-400 text-center mt-3">
              デモ用の初期値が入っています
            </p>
            <div className="text-center mt-6">
              <Button onClick={() => setPhase("survey-q")} size="md">
                つぎへ
              </Button>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  // --- Phase: SURVEY QUESTIONS ---
  const question = DEFAULT_SURVEY[currentQ];
  const selectedTags = question ? (allAnswers[question.id] || []) : [];

  const handleTagToggle = (value: string) => {
    const tag = value as InterestTag;
    const current = selectedTags;
    const updated = current.includes(tag) ? current.filter((t) => t !== tag) : [...current, tag];
    setAllAnswers({ ...allAnswers, [question.id]: updated });
  };

  const handleSurveyNext = () => {
    if (currentQ < DEFAULT_SURVEY.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      // Initialize processing phase state
      setProcElapsed(0);
      setProcPhase(cmMatch.platinumCM ? "platinum" : cmMatch.matchedCM ? "matched" : "waiting");
      setPhase("processing");
    }
  };

  const renderSurveyQ = () => {
    if (!question) return null;
    const isLast = currentQ === DEFAULT_SURVEY.length - 1;
    return (
      <div className="max-w-lg mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex gap-2 mb-8 justify-center"
          role="navigation"
          aria-label={`アンケート進捗: ${currentQ + 1} / ${DEFAULT_SURVEY.length}`}
        >
          <div className="w-3 h-3 rounded-full bg-[#98E4C1]" aria-hidden="true" />
          {DEFAULT_SURVEY.map((_, i) => (
            <div
              key={i}
              className={`w-3 h-3 rounded-full transition-colors ${
                i === currentQ ? "bg-[#6EC6FF]" : i < currentQ ? "bg-[#98E4C1]" : "bg-gray-200"
              }`}
              aria-hidden="true"
            />
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          <motion.div
            key={question.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.3 }}
          >
            <Card>
              <div className="text-center mb-1">
                <span className="text-xs text-gray-400 font-medium">
                  Q{currentQ + 1} / {DEFAULT_SURVEY.length}
                </span>
              </div>
              <h2 className="text-lg font-bold text-gray-700 text-center mb-6">
                {question.question}
              </h2>
              <TagSelector
                options={question.options.map((o) => ({ label: o.label, value: o.tag }))}
                selected={selectedTags}
                onToggle={handleTagToggle}
                maxSelections={question.maxSelections}
              />
              <p className="text-xs text-gray-400 text-center mt-3">
                最大{question.maxSelections}つまで選択できます
              </p>
              <div className="text-center mt-6">
                <Button onClick={handleSurveyNext} disabled={selectedTags.length === 0} size="md">
                  {isLast ? "スタート" : "つぎへ"}
                </Button>
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  // --- Phase: PROCESSING (Platinum CM) ---
  const handlePlatinumDone = useCallback(() => {
    setProcPhase(cmMatch.matchedCM ? "matched" : "waiting");
  }, [cmMatch.matchedCM]);

  const handleProcMatchedDone = useCallback(() => {
    setProcPhase("waiting");
  }, []);

  const renderProcessing = () => {
    const canProceed = procElapsed >= DEMO_TIMER;

    return (
      <div className="max-w-lg mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-800">
            イベントの全写真データを読み込んでいます...
          </h1>
          <p className="text-gray-400 text-sm mt-1">しばらくお待ちください</p>
        </motion.div>

        <div className="w-full mb-6">
          <DemoProgressTimer
            duration={DEMO_TIMER}
            onTick={setProcElapsed}
            label="読み込み中"
          />
        </div>

        <div className="w-full space-y-4">
          {procPhase === "platinum" && cmMatch.platinumCM && (
            <Card>
              <p className="text-xs text-center text-gray-400 mb-2">
                今日の写真は <span className="font-bold text-[#6EC6FF]">{cmMatch.platinumCM.name}</span> からのプレゼントです！
              </p>
              <VideoPlayer
                videoId={cmMatch.platinumCM.videos.cm15}
                duration={DEMO_TIMER}
                label="提供CM（デモ: 5秒）"
                onComplete={handlePlatinumDone}
              />
            </Card>
          )}

          {procPhase === "matched" && cmMatch.matchedCM && (
            <Card>
              <VideoPlayer
                videoId={cmMatch.matchedCM.videos.cm30}
                duration={DEMO_TIMER}
                label={`${cmMatch.matchedCM.name} のおすすめ（デモ: 5秒）`}
                onComplete={handleProcMatchedDone}
              />
            </Card>
          )}

          {procPhase === "waiting" && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-8">
              <LoadingAnimation />
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: canProceed ? 1 : 0.3 }}
          className="mt-8"
        >
          <Button
            onClick={() => {
              // Pre-select first 3 photos
              setSelectedIds(DEMO_EVENT.photos.slice(0, 3).map((p) => p.id));
              setPhase("photos");
            }}
            disabled={!canProceed}
            size="lg"
          >
            写真を見る
          </Button>
        </motion.div>
      </div>
    );
  };

  // --- Phase: PHOTOS ---
  const handleToggleSelect = (photo: PhotoData) => {
    setSelectedIds((prev) =>
      prev.includes(photo.id) ? prev.filter((id) => id !== photo.id) : [...prev, photo.id]
    );
  };

  const renderPhotos = () => (
    <div className="max-w-3xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-6"
      >
        <h1 className="text-2xl font-bold text-gray-800">{DEMO_EVENT.name} の写真</h1>
        <p className="text-gray-400 text-sm mt-1">
          {DEMO_EVENT.photos.length}枚の写真が見つかりました（プレビュー版）
        </p>
      </motion.div>

      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => {
            if (selectedIds.length === DEMO_EVENT.photos.length) {
              setSelectedIds([]);
            } else {
              setSelectedIds(DEMO_EVENT.photos.map((p) => p.id));
            }
          }}
          aria-label={selectedIds.length === DEMO_EVENT.photos.length ? "すべての写真の選択を解除" : "すべての写真を選択"}
          className="text-sm text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
        >
          {selectedIds.length === DEMO_EVENT.photos.length ? "選択解除" : "すべて選択"}
        </button>
        <AnimatePresence>
          {selectedIds.length > 0 && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="text-sm font-bold text-[#6EC6FF] bg-blue-50 px-3 py-1 rounded-full"
              role="status"
              aria-live="polite"
            >
              {selectedIds.length}枚選択中
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <PhotoGrid
        photos={DEMO_EVENT.photos}
        selectedIds={selectedIds}
        onToggleSelect={handleToggleSelect}
        onPreview={setPreviewPhoto}
      />

      <PhotoModal photo={previewPhoto} onClose={() => setPreviewPhoto(null)} />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="text-center mt-8 mb-8"
      >
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-3xl p-6 border border-blue-100">
          <p className="text-gray-600 font-medium mb-3">
            {selectedIds.length > 0
              ? `${selectedIds.length}枚の写真を高画質でダウンロード`
              : "写真を選択してダウンロード"}
          </p>
          <Button
            onClick={() => {
              setDlElapsed(0);
              setDlVideoDone(!cmMatch.matchedCM);
              setPhase("downloading");
            }}
            disabled={selectedIds.length === 0}
            size="lg"
          >
            選択した写真をダウンロード
          </Button>
        </div>
      </motion.div>
    </div>
  );

  // --- Phase: DOWNLOADING (Matched CM 60s → shortened) ---
  const handleDlVideoDone = useCallback(() => {
    setDlVideoDone(true);
  }, []);

  const renderDownloading = () => {
    const canProceed = dlElapsed >= DEMO_TIMER && dlVideoDone;

    return (
      <div className="max-w-lg mx-auto flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h1 className="text-2xl font-bold text-gray-800">高画質データを生成中...</h1>
          <p className="text-gray-400 text-sm mt-1">
            {selectedIds.length}枚の写真を処理中...もうすぐ完了します
          </p>
        </motion.div>

        <div className="w-full mb-6">
          <DemoProgressTimer
            duration={DEMO_TIMER}
            onTick={setDlElapsed}
            label="データ生成中"
          />
        </div>

        <div className="w-full">
          {cmMatch.matchedCM ? (
            <Card>
              <VideoPlayer
                videoId={cmMatch.matchedCM.videos.cm60}
                duration={DEMO_TIMER}
                label={`${cmMatch.matchedCM.name} からのメッセージ（デモ: 5秒）`}
                onComplete={handleDlVideoDone}
              />
            </Card>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center py-8">
              <LoadingAnimation />
            </motion.div>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: canProceed ? 1 : 0.3 }}
          className="mt-8"
        >
          <Button onClick={() => setPhase("complete")} disabled={!canProceed} size="lg">
            ダウンロードへ
          </Button>
        </motion.div>
      </div>
    );
  };

  // --- Phase: COMPLETE ---
  const renderComplete = () => (
    <div className="max-w-lg mx-auto space-y-6">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <motion.div
          className="text-5xl mb-3"
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          🎉
        </motion.div>
        <h1 className="text-2xl font-bold text-gray-800">写真の準備ができました！</h1>
        <p className="text-gray-400 text-sm mt-1">
          {selectedIds.length}枚の写真が選択されています
        </p>
      </motion.div>

      {/* Platinum sponsor frame */}
      {cmMatch.platinumCM && (
        <Card className="text-center">
          <div className="border-2 border-dashed border-blue-200 rounded-2xl p-4 mb-3">
            <p className="text-xs text-gray-400 mb-2">
              {cmMatch.platinumCM.name} 提供 記念フレーム
            </p>
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl p-8 text-center">
              <p className="text-lg font-bold text-gray-600">{DEMO_EVENT.name}</p>
              <p className="text-xs text-gray-400 mt-1">Special Photo Frame</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cmMatch.platinumCM.logoUrl}
                alt={cmMatch.platinumCM.name}
                className="w-10 h-10 rounded-full mx-auto mt-3"
              />
            </div>
          </div>
          <Button size="md" variant="secondary">
            記念フレームを保存（デモ）
          </Button>
        </Card>
      )}

      {/* Download button (demo: no actual download) */}
      <Card className="text-center">
        <p className="text-sm text-gray-600 mb-3">
          {selectedIds.length}枚の高画質写真をまとめてダウンロード
        </p>
        <Button size="lg" variant="secondary">
          写真をダウンロード（デモ）
        </Button>
      </Card>

      {/* Matched company offer */}
      {cmMatch.matchedCM && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <Card>
            <div className="flex items-center gap-3 mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cmMatch.matchedCM.logoUrl}
                alt={cmMatch.matchedCM.name}
                className="w-12 h-12 rounded-full"
              />
              <div>
                <p className="font-bold text-gray-700 text-sm">{cmMatch.matchedCM.name}</p>
                <p className="text-xs text-gray-400">限定オファー</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-yellow-50 to-pink-50 rounded-xl p-4 mb-3 border border-yellow-100">
              <p className="font-bold text-gray-700">{cmMatch.matchedCM.offerText}</p>
              {cmMatch.matchedCM.couponCode && (
                <p className="text-xs text-gray-500 mt-1">
                  クーポンコード: <code className="bg-white px-2 py-0.5 rounded font-mono">{cmMatch.matchedCM.couponCode}</code>
                </p>
              )}
            </div>
            <Button variant="secondary" size="sm" className="w-full">
              詳しく見る（デモ）
            </Button>
          </Card>
        </motion.div>
      )}

      {/* Restart demo */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="text-center pb-8"
      >
        <Button onClick={resetDemo} variant="ghost" size="md">
          デモをもう一度体験する
        </Button>
      </motion.div>
    </div>
  );

  // --- Main render ---
  const phaseRenderers: Record<Phase, () => React.ReactNode> = {
    "top": renderTop,
    "survey-name": renderSurveyName,
    "survey-q": renderSurveyQ,
    "processing": renderProcessing,
    "photos": renderPhotos,
    "downloading": renderDownloading,
    "complete": renderComplete,
  };

  return (
    <>
      <DemoBanner currentStep={PHASE_TO_STEP[phase]} onBackToTop={resetDemo} />
      <main className="min-h-screen p-6 pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3 }}
          >
            {phaseRenderers[phase]()}
          </motion.div>
        </AnimatePresence>
      </main>
    </>
  );
}

// --- Helper: Progress timer for demo (auto-increments elapsed) ---
import { Dispatch, SetStateAction, useEffect, useRef } from "react";

function DemoProgressTimer({
  duration,
  onTick,
  label,
}: {
  duration: number;
  onTick: Dispatch<SetStateAction<number>>;
  label: string;
}) {
  const [elapsed, setLocalElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let count = 0;
    intervalRef.current = setInterval(() => {
      count++;
      if (count >= duration) {
        if (intervalRef.current) clearInterval(intervalRef.current);
        setLocalElapsed(duration);
        onTick(duration);
      } else {
        setLocalElapsed(count);
        onTick(count);
      }
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [duration, onTick]);

  const progress = Math.min(100, (elapsed / duration) * 100);
  return <ProgressBar progress={progress} label={label} />;
}
