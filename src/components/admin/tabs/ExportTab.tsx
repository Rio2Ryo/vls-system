"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { Tenant, EventData, AnalyticsRecord } from "@/lib/types";
import {
  getStoredTenants,
  getStoredEvents,
  getStoredAnalytics,
} from "@/lib/store";

interface ExportTabProps {
  onSave: (msg: string) => void;
  tenantId?: string | null;
}

function downloadCsv(filename: string, csvContent: string) {
  const bom = "\uFEFF";
  const blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | boolean | undefined | null): string {
  if (value == null) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export default function ExportTab({ onSave, tenantId }: ExportTabProps) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [events, setEvents] = useState<EventData[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [filterTenantId, setFilterTenantId] = useState<string>("");

  useEffect(() => {
    setTenants(getStoredTenants());
    setEvents(getStoredEvents());
    setAnalytics(getStoredAnalytics());
  }, []);

  // Apply tenant filtering
  const filteredEvents = (() => {
    const tid = tenantId || filterTenantId;
    if (!tid) return events;
    return events.filter((e) => e.tenantId === tid);
  })();

  const filteredAnalytics = (() => {
    const tid = tenantId || filterTenantId;
    if (!tid) return analytics;
    const tenantEventIds = new Set(
      events.filter((e) => e.tenantId === tid).map((e) => e.id)
    );
    return analytics.filter((a) => tenantEventIds.has(a.eventId));
  })();

  const eventNameMap = new Map(events.map((e) => [e.id, e.name]));

  // A. Tenant CSV export
  const exportTenants = () => {
    const header = "テナント名,slug,プラン,連絡先メール,連絡先名,ライセンス開始,ライセンス終了,アクティブ,作成日";
    const rows = tenants.map((t) =>
      [
        escapeCsv(t.name),
        escapeCsv(t.slug),
        escapeCsv(t.plan),
        escapeCsv(t.contactEmail),
        escapeCsv(t.contactName),
        escapeCsv(t.licenseStart || ""),
        escapeCsv(t.licenseEnd || ""),
        escapeCsv(t.isActive !== false ? "有効" : "無効"),
        escapeCsv(t.createdAt ? new Date(t.createdAt).toLocaleDateString("ja-JP") : ""),
      ].join(",")
    );
    downloadCsv("tenants_export.csv", [header, ...rows].join("\n"));
    onSave(`テナント一覧CSV（${tenants.length}件）をエクスポートしました`);
  };

  // B. Event CSV export
  const exportEvents = () => {
    const header = "イベント名,日付,会場,パスワード,説明,写真数,企業数,テナントID";
    const rows = filteredEvents.map((e) =>
      [
        escapeCsv(e.name),
        escapeCsv(e.date),
        escapeCsv(e.venue || ""),
        escapeCsv(e.password),
        escapeCsv(e.description),
        escapeCsv(e.photos.length),
        escapeCsv(e.companyIds ? e.companyIds.length : "全企業"),
        escapeCsv(e.tenantId || ""),
      ].join(",")
    );
    downloadCsv("events_export.csv", [header, ...rows].join("\n"));
    onSave(`イベント詳細CSV（${filteredEvents.length}件）をエクスポートしました`);
  };

  // C. Analytics CSV export
  const exportAnalytics = () => {
    const header = "日時,イベント名,参加者名,アンケート完了,CM視聴,写真閲覧,DL完了,マッチ企業";
    const rows = filteredAnalytics.map((a) =>
      [
        escapeCsv(new Date(a.timestamp).toLocaleString("ja-JP")),
        escapeCsv(eventNameMap.get(a.eventId) || a.eventId),
        escapeCsv(a.respondentName || "匿名"),
        escapeCsv(a.stepsCompleted.survey ? "○" : "×"),
        escapeCsv(a.stepsCompleted.cmViewed ? "○" : "×"),
        escapeCsv(a.stepsCompleted.photosViewed ? "○" : "×"),
        escapeCsv(a.stepsCompleted.downloaded ? "○" : "×"),
        escapeCsv(a.matchedCompanyId || ""),
      ].join(",")
    );
    downloadCsv("analytics_export.csv", [header, ...rows].join("\n"));
    onSave(`アクセス履歴CSV（${filteredAnalytics.length}件）をエクスポートしました`);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">
        CSVエクスポート
      </h2>

      {/* Tenant filter (super admin only) */}
      {!tenantId && tenants.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-200">
            テナントフィルタ:
          </label>
          <select
            value={filterTenantId}
            onChange={(e) => setFilterTenantId(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-700 dark:text-gray-200"
          >
            <option value="">すべて</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* A. Tenant CSV */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              テナント一覧
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {tenants.length}件のテナントデータ
            </p>
          </div>
          <button
            onClick={exportTenants}
            disabled={tenants.length === 0}
            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            エクスポート
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          カラム: テナント名, slug, プラン, 連絡先メール, 連絡先名, ライセンス開始, ライセンス終了, アクティブ, 作成日
        </p>
      </Card>

      {/* B. Event CSV */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              イベント詳細
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredEvents.length}件のイベントデータ
            </p>
          </div>
          <button
            onClick={exportEvents}
            disabled={filteredEvents.length === 0}
            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            エクスポート
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          カラム: イベント名, 日付, 会場, パスワード, 説明, 写真数, 企業数, テナントID
        </p>
      </Card>

      {/* C. Analytics CSV */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">
              アクセス履歴
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {filteredAnalytics.length}件のアクセスデータ
            </p>
          </div>
          <button
            onClick={exportAnalytics}
            disabled={filteredAnalytics.length === 0}
            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            エクスポート
          </button>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          カラム: 日時, イベント名, 参加者名, アンケート完了, CM視聴, 写真閲覧, DL完了, マッチ企業
        </p>
      </Card>
    </div>
  );
}
