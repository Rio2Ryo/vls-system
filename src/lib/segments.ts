import { CMConfig, SegmentType, SurveyQuestion } from "./types";

// YouTube video IDs for CM (placeholder - replace with actual CMs)
const CM_VIDEO_IDS = {
  short15: "dQw4w9WgXcQ", // 15s placeholder
  short30: "dQw4w9WgXcQ", // 30s placeholder
  long60: "dQw4w9WgXcQ", // 60s placeholder
};

/**
 * セグメントA: 40%確率CM表示, 視聴率100%
 * セグメントB: 50%確率CM表示, 視聴率50%
 * セグメントC: 80%確率CM表示 (OP 20%)
 * セグメントD: 80%確率CM表示 (OP 20%) × 2回
 */
export function assignSegment(): SegmentType {
  const rand = Math.random();
  if (rand < 0.25) return "A";
  if (rand < 0.5) return "B";
  if (rand < 0.75) return "C";
  return "D";
}

export function getCMConfig(segment: SegmentType, phase: "processing" | "downloading"): CMConfig {
  switch (segment) {
    case "A":
      return {
        segment: "A",
        showCM: Math.random() < 0.4,
        videoIds: phase === "processing"
          ? [CM_VIDEO_IDS.short15, CM_VIDEO_IDS.short30]
          : [CM_VIDEO_IDS.long60],
        durations: phase === "processing" ? [15, 30] : [60],
      };
    case "B":
      return {
        segment: "B",
        showCM: Math.random() < 0.5,
        videoIds: phase === "processing"
          ? [CM_VIDEO_IDS.short15, CM_VIDEO_IDS.short30]
          : [CM_VIDEO_IDS.long60],
        durations: phase === "processing" ? [15, 30] : [60],
      };
    case "C":
      return {
        segment: "C",
        showCM: Math.random() < 0.8,
        videoIds: phase === "processing"
          ? [CM_VIDEO_IDS.short15, CM_VIDEO_IDS.short30]
          : [CM_VIDEO_IDS.long60],
        durations: phase === "processing" ? [15, 30] : [60],
      };
    case "D":
      return {
        segment: "D",
        showCM: Math.random() < 0.8,
        videoIds: phase === "processing"
          ? [CM_VIDEO_IDS.short15, CM_VIDEO_IDS.short30]
          : [CM_VIDEO_IDS.long60, CM_VIDEO_IDS.long60],
        durations: phase === "processing" ? [15, 30] : [60, 60],
      };
  }
}

export function getTotalWaitTime(phase: "processing" | "downloading"): number {
  return phase === "processing" ? 45 : 60;
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    id: "q1",
    question: "今日のイベントはいかがでしたか？",
    options: ["とても楽しかった！", "楽しかった", "ふつう", "あまり楽しくなかった"],
  },
  {
    id: "q2",
    question: "また参加したいですか？",
    options: ["ぜひ参加したい！", "機会があれば", "わからない", "もう参加しない"],
  },
  {
    id: "q3",
    question: "お友達にもおすすめしたいですか？",
    options: ["ぜったいおすすめ！", "おすすめする", "わからない", "おすすめしない"],
  },
  {
    id: "q4",
    question: "写真サービスについてどう思いますか？",
    options: ["とても便利！", "便利", "ふつう", "使いにくい"],
  },
];
