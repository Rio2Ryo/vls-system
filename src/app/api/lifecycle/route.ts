import { NextRequest, NextResponse } from "next/server";
import { r2Get, r2List, isR2Configured } from "@/lib/r2";
import { ADMIN_PASSWORD } from "@/lib/data";

export const runtime = "nodejs";

interface LifecycleResult {
  timestamp: string;
  scanned: number;
  compressed: number;
  deleted: number;
  errors: number;
  skipped: number;
  details: string[];
}

interface StorageStats {
  totalSize: number;
  totalCount: number;
  activeSize: number;
  activeCount: number;
  longTermSize: number;
  longTermCount: number;
  byPrefix: Record<string, { count: number; size: number }>;
  ageDistribution: {
    recent: number;   // <7d
    month: number;    // 7-30d
    quarter: number;  // 30-90d
    year: number;     // 90-365d
    old: number;      // >365d
  };
}

function daysSince(dateStr: string): number {
  return (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24);
}

/**
 * GET /api/lifecycle
 * Returns lifecycle status + storage stats.
 * Requires x-admin-password header.
 */
export async function GET(request: NextRequest) {
  const adminPassword = request.headers.get("x-admin-password");
  if (adminPassword !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "R2 storage is not configured" },
      { status: 503 }
    );
  }

  try {
    // Fetch last lifecycle run result from R2
    let lastRun: LifecycleResult | null = null;
    try {
      const obj = await r2Get("_lifecycle/last-run.json");
      if (obj) {
        const text = new TextDecoder().decode(obj.body);
        lastRun = JSON.parse(text);
      }
    } catch { /* no lifecycle data yet */ }

    // Fetch lifecycle history
    let history: LifecycleResult[] = [];
    try {
      const obj = await r2Get("_lifecycle/history.json");
      if (obj) {
        const text = new TextDecoder().decode(obj.body);
        history = JSON.parse(text);
      }
    } catch { /* no history yet */ }

    // Compute storage stats from file listing
    const stats: StorageStats = {
      totalSize: 0,
      totalCount: 0,
      activeSize: 0,
      activeCount: 0,
      longTermSize: 0,
      longTermCount: 0,
      byPrefix: {},
      ageDistribution: { recent: 0, month: 0, quarter: 0, year: 0, old: 0 },
    };

    // List all prefixes first, then list each
    const rootResult = await r2List(undefined, 200);
    const allFiles = [...rootResult.objects];

    // Also list known sub-prefixes
    for (const prefix of rootResult.prefixes) {
      try {
        const subResult = await r2List(prefix, 200);
        allFiles.push(...subResult.objects);
        // Go one deeper for event-specific dirs
        for (const subPrefix of subResult.prefixes) {
          try {
            const deepResult = await r2List(subPrefix, 200);
            allFiles.push(...deepResult.objects);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    }

    for (const file of allFiles) {
      if (file.key.startsWith("_lifecycle/")) continue;

      stats.totalSize += file.size;
      stats.totalCount++;

      const topPrefix = file.key.split("/")[0] + "/";
      if (!stats.byPrefix[topPrefix]) {
        stats.byPrefix[topPrefix] = { count: 0, size: 0 };
      }
      stats.byPrefix[topPrefix].count++;
      stats.byPrefix[topPrefix].size += file.size;

      if (file.key.startsWith("long-term/")) {
        stats.longTermSize += file.size;
        stats.longTermCount++;
      } else {
        stats.activeSize += file.size;
        stats.activeCount++;
      }

      if (file.lastModified) {
        const age = daysSince(file.lastModified);
        if (age < 7) stats.ageDistribution.recent++;
        else if (age < 30) stats.ageDistribution.month++;
        else if (age < 90) stats.ageDistribution.quarter++;
        else if (age < 365) stats.ageDistribution.year++;
        else stats.ageDistribution.old++;
      }
    }

    return NextResponse.json({
      lastRun,
      history: history.slice(-10), // last 10 runs
      stats,
      config: {
        compressAfterDays: 30,
        deleteAfterDays: 365,
        cronSchedule: "0 3 * * * (毎日 03:00 UTC)",
      },
    });
  } catch (error) {
    console.error("Lifecycle status error:", error);
    return NextResponse.json(
      { error: "Failed to get lifecycle status" },
      { status: 500 }
    );
  }
}
