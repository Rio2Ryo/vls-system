import { AnalyticsRecord, Company, EventData, SurveyQuestion, VideoPlayRecord } from "@/lib/types";
import { getCsrfToken } from "@/lib/csrf";

export const inputCls = "w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm";

export const TIER_COLORS: Record<string, string> = {
  platinum: "bg-blue-100 text-blue-700",
  gold: "bg-yellow-100 text-yellow-700",
  silver: "bg-gray-100 text-gray-600",
  bronze: "bg-orange-100 text-orange-700",
};

// ===== CSV Export =====
function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportSurveyCsv(
  records: AnalyticsRecord[],
  questions: SurveyQuestion[],
  events: EventData[]
) {
  const eventMap = new Map(events.map((e) => [e.id, e.name]));

  const tagLabelMap = new Map<string, string>();
  for (const q of questions) {
    for (const opt of q.options) {
      tagLabelMap.set(opt.tag, opt.label);
    }
  }

  const headerCols = [
    "名前",
    "イベント名",
    "回答日時",
    ...questions.map((q) => q.question),
    "DL完了",
  ];
  const rows: string[] = [headerCols.map(escapeCsvField).join(",")];

  for (const r of records) {
    const name = r.respondentName || "匿名";
    const eventName = eventMap.get(r.eventId) || r.eventId;
    const dt = new Date(r.timestamp);
    const dateStr = `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;

    const answerCols = questions.map((q) => {
      const tags = r.surveyAnswers?.[q.id] || [];
      return tags.map((t) => tagLabelMap.get(t) || t).join(" / ");
    });

    const downloaded = r.stepsCompleted.downloaded ? "Yes" : "No";

    const row = [name, eventName, dateStr, ...answerCols, downloaded];
    rows.push(row.map(escapeCsvField).join(","));
  }

  const bom = "\uFEFF";
  const csvContent = bom + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `アンケート回答_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportEventStatsCsv(
  events: EventData[],
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
  companies: Company[]
) {
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

  const headerCols = [
    "イベント名", "開催日", "会場",
    "アクセス数", "アンケート完了", "アンケート完了率",
    "CM視聴完了", "CM視聴完了率", "写真閲覧数", "写真閲覧率",
    "DL完了数", "DL完了率",
    "CM再生回数（合計）", "CM完了回数（合計）", "CM完了率（合計）", "CM平均視聴秒数",
    "CM15s再生", "CM15s完了率", "CM30s再生", "CM30s完了率", "CM60s再生", "CM60s完了率",
    "企業別CM再生詳細",
  ];
  const rows: string[] = [headerCols.map(escapeCsvField).join(",")];

  for (const evt of events) {
    const evtAnalytics = analytics.filter((r) => r.eventId === evt.id);
    const evtPlays = videoPlays.filter((p) => p.eventId === evt.id);

    const access = evtAnalytics.filter((r) => r.stepsCompleted.access).length;
    const surveyed = evtAnalytics.filter((r) => r.stepsCompleted.survey).length;
    const cmViewed = evtAnalytics.filter((r) => r.stepsCompleted.cmViewed).length;
    const photosViewed = evtAnalytics.filter((r) => r.stepsCompleted.photosViewed).length;
    const downloaded = evtAnalytics.filter((r) => r.stepsCompleted.downloaded).length;

    const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "—";

    const totalCmPlays = evtPlays.length;
    const totalCmCompleted = evtPlays.filter((p) => p.completed).length;
    const avgWatch = totalCmPlays > 0
      ? Math.round(evtPlays.reduce((s, p) => s + p.watchedSeconds, 0) / totalCmPlays)
      : 0;

    const cmByType = (type: "cm15" | "cm30" | "cm60") => {
      const typed = evtPlays.filter((p) => p.cmType === type);
      const comp = typed.filter((p) => p.completed).length;
      return { plays: typed.length, rate: pct(comp, typed.length) };
    };
    const cm15 = cmByType("cm15");
    const cm30 = cmByType("cm30");
    const cm60 = cmByType("cm60");

    const companyBreakdown: string[] = [];
    const companyPlayMap = new Map<string, { plays: number; completed: number }>();
    for (const p of evtPlays) {
      if (!companyPlayMap.has(p.companyId)) {
        companyPlayMap.set(p.companyId, { plays: 0, completed: 0 });
      }
      const entry = companyPlayMap.get(p.companyId)!;
      entry.plays++;
      if (p.completed) entry.completed++;
    }
    Array.from(companyPlayMap.entries()).forEach(([cId, stat]) => {
      const name = companyMap.get(cId) || cId;
      companyBreakdown.push(`${name}:${stat.plays}回(完了${pct(stat.completed, stat.plays)})`);
    });

    const row = [
      evt.name, evt.date, evt.venue || "",
      String(access), String(surveyed), pct(surveyed, access),
      String(cmViewed), pct(cmViewed, access),
      String(photosViewed), pct(photosViewed, access),
      String(downloaded), pct(downloaded, access),
      String(totalCmPlays), String(totalCmCompleted), pct(totalCmCompleted, totalCmPlays),
      `${avgWatch}秒`,
      String(cm15.plays), cm15.rate,
      String(cm30.plays), cm30.rate,
      String(cm60.plays), cm60.rate,
      companyBreakdown.join(" / "),
    ];
    rows.push(row.map(escapeCsvField).join(","));
  }

  const bom = "\uFEFF";
  const csvContent = bom + rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `イベント統計_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Upload a file to R2 via /api/upload (single POST with FormData). Session cookie handles auth. */
export async function uploadFileToR2(
  file: File | Blob,
  eventId: string,
  type: "photos" | "thumbs" | "videos" | "logos",
  fileName?: string
): Promise<{ key: string; url: string } | null> {
  try {
    const fd = new FormData();
    const name = fileName || (file instanceof File ? file.name : "file.jpg");
    fd.append("file", file, name);
    fd.append("eventId", eventId);
    fd.append("type", type);

    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { "x-csrf-token": getCsrfToken() },
      body: fd,
    });
    if (!res.ok) return null;
    const result = await res.json();
    return { key: result.key, url: result.url };
  } catch {
    return null;
  }
}

export function createThumbnailBlob(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 400;
        canvas.height = 300;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, 400, 300);
        canvas.toBlob(
          (blob) => resolve(blob!),
          "image/jpeg",
          0.6
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

