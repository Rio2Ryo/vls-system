"use client";

import { useCallback, useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { EventData } from "@/lib/types";
import { csrfHeaders } from "@/lib/csrf";
import { getStoredEvents } from "@/lib/store";
import { inputCls, uploadFileToR2 } from "./adminUtils";

interface R2FileItem {
  key: string;
  size: number;
  lastModified: string;
  contentType?: string;
}

interface LifecycleRunResult {
  timestamp: string;
  scanned: number;
  compressed: number;
  deleted: number;
  errors: number;
  skipped: number;
  details: string[];
}

interface LifecycleData {
  lastRun: LifecycleRunResult | null;
  history: LifecycleRunResult[];
  stats: {
    totalSize: number;
    totalCount: number;
    activeSize: number;
    activeCount: number;
    longTermSize: number;
    longTermCount: number;
    byPrefix: Record<string, { count: number; size: number }>;
    ageDistribution: { recent: number; month: number; quarter: number; year: number; old: number };
  };
  config: { compressAfterDays: number; deleteAfterDays: number; cronSchedule: string };
}

interface Props {
  onSave: (msg: string) => void;
}

export default function StorageTab({ onSave }: Props) {
  const [files, setFiles] = useState<R2FileItem[]>([]);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadType, setUploadType] = useState<"photos" | "videos">("photos");
  const [uploadEventId, setUploadEventId] = useState("");
  const [lifecycle, setLifecycle] = useState<LifecycleData | null>(null);
  const [lifecycleLoading, setLifecycleLoading] = useState(false);
  const [events, setEvents] = useState<EventData[]>([]);

  const loadFiles = useCallback(async (prefix?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (prefix) params.set("prefix", prefix);
      const res = await fetch(`/api/files?${params}`);
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setFiles(data.objects || []);
      setPrefixes(data.prefixes || []);
    } catch {
      setFiles([]);
      setPrefixes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadLifecycle = useCallback(async () => {
    setLifecycleLoading(true);
    try {
      const res = await fetch("/api/lifecycle");
      if (res.ok) {
        setLifecycle(await res.json());
      }
    } catch { /* ignore */ }
    finally { setLifecycleLoading(false); }
  }, []);

  useEffect(() => {
    loadFiles(currentPrefix || undefined);
    setEvents(getStoredEvents());
    loadLifecycle();
  }, [currentPrefix, loadFiles, loadLifecycle]);

  const navigateTo = (prefix: string) => {
    setCurrentPrefix(prefix);
  };

  const navigateUp = () => {
    const parts = currentPrefix.replace(/\/$/, "").split("/");
    parts.pop();
    setCurrentPrefix(parts.length > 0 ? parts.join("/") + "/" : "");
  };

  const handleUpload = async (fileList: FileList) => {
    setUploading(true);
    let uploaded = 0;
    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const result = await uploadFileToR2(
        file,
        uploadEventId || "general",
        uploadType,
        file.name
      );
      if (result) uploaded++;
    }
    setUploading(false);
    if (uploaded > 0) {
      onSave(`${uploaded}ファイルをR2にアップロードしました`);
      loadFiles(currentPrefix || undefined);
    }
  };

  const handleDelete = async (key: string) => {
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ key }),
      });
      if (res.ok) {
        onSave("ファイルを削除しました");
        loadFiles(currentPrefix || undefined);
      }
    } catch { /* ignore */ }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const getFileIcon = (key: string, contentType?: string) => {
    if (contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(key)) return "🖼️";
    if (contentType?.startsWith("video/") || /\.(mp4|mov|avi|webm)$/i.test(key)) return "🎬";
    return "📄";
  };

  return (
    <div className="space-y-4" data-testid="admin-storage">
      <h2 className="text-lg font-bold text-gray-800">R2 ストレージ (vls-media)</h2>

      {/* Upload form */}
      <Card>
        <h3 className="font-bold text-gray-700 mb-3">ファイルアップロード</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">タイプ</label>
              <select
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as "photos" | "videos")}
                aria-label="アップロードタイプ"
                className={inputCls}
                data-testid="storage-upload-type"
              >
                <option value="photos">写真 (photos/)</option>
                <option value="videos">動画 (videos/)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">イベント</label>
              <select
                value={uploadEventId}
                onChange={(e) => setUploadEventId(e.target.value)}
                aria-label="イベント選択"
                className={inputCls}
                data-testid="storage-upload-event"
              >
                <option value="">一般 (general)</option>
                {events.map((evt) => (
                  <option key={evt.id} value={evt.id}>{evt.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div
            role="button"
            tabIndex={0}
            aria-label="クリックしてファイルを選択"
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
              uploading ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-[#6EC6FF]"
            }`}
            onClick={() => !uploading && document.getElementById("r2-file-input")?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); document.getElementById("r2-file-input")?.click(); } }}
          >
            {uploading ? (
              <p className="text-sm text-blue-600 animate-pulse">アップロード中...</p>
            ) : (
              <>
                <p className="text-sm text-gray-600">クリックしてファイルを選択</p>
                <p className="text-xs text-gray-400 mt-1">写真・動画ファイル対応</p>
              </>
            )}
            <input
              id="r2-file-input"
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              data-testid="storage-file-input"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  handleUpload(e.target.files);
                  e.target.value = "";
                }
              }}
            />
          </div>
        </div>
      </Card>

      {/* File browser */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-gray-700">ファイル一覧</h3>
            {loading && <span className="text-xs text-gray-400 animate-pulse">読み込み中...</span>}
          </div>
          <button
            onClick={() => loadFiles(currentPrefix || undefined)}
            aria-label="ファイル一覧を更新"
            className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            更新
          </button>
        </div>

        {/* Breadcrumb */}
        <nav aria-label="ストレージパス" className="flex items-center gap-1 mb-3 text-xs">
          <button
            onClick={() => setCurrentPrefix("")}
            className={`px-2 py-1 rounded ${!currentPrefix ? "bg-[#6EC6FF] text-white" : "text-[#6EC6FF] hover:underline"}`}
          >
            vls-media
          </button>
          {currentPrefix && currentPrefix.split("/").filter(Boolean).map((part, i, arr) => {
            const path = arr.slice(0, i + 1).join("/") + "/";
            return (
              <span key={path} className="flex items-center gap-1">
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => setCurrentPrefix(path)}
                  className={`px-2 py-1 rounded ${
                    path === currentPrefix ? "bg-[#6EC6FF] text-white" : "text-[#6EC6FF] hover:underline"
                  }`}
                >
                  {part}
                </button>
              </span>
            );
          })}
        </nav>

        {/* Folders */}
        {(currentPrefix || prefixes.length > 0) && (
          <div className="space-y-1 mb-3">
            {currentPrefix && (
              <button
                onClick={navigateUp}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
              >
                <span>📁</span>
                <span>..</span>
              </button>
            )}
            {prefixes.map((p) => (
              <button
                key={p}
                onClick={() => navigateTo(p)}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-600"
              >
                <span>📁</span>
                <span className="font-medium">{p.replace(currentPrefix, "").replace(/\/$/, "")}</span>
              </button>
            ))}
          </div>
        )}

        {/* Files */}
        {files.length === 0 && !loading && prefixes.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">ファイルがありません</p>
        )}
        {files.length > 0 && (
          <div className="space-y-1">
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 px-3 py-1 text-[10px] text-gray-400 font-medium border-b border-gray-100">
              <span></span>
              <span>ファイル名</span>
              <span>サイズ</span>
              <span>更新日時</span>
              <span></span>
            </div>
            {files.map((f) => {
              const name = f.key.replace(currentPrefix, "");
              const isImage = f.contentType?.startsWith("image/") || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.key);
              return (
                <div
                  key={f.key}
                  className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 items-center px-3 py-2 rounded-lg hover:bg-gray-50 group"
                >
                  <span className="text-sm">{getFileIcon(f.key, f.contentType)}</span>
                  <div className="min-w-0">
                    <a
                      href={`/api/media/${f.key}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-700 hover:text-[#6EC6FF] truncate block"
                      title={f.key}
                    >
                      {name}
                    </a>
                    {isImage && (
                      <div className="mt-1">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/media/${f.key}`}
                          alt={name}
                          className="h-10 rounded object-cover"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatSize(f.size)}</span>
                  <span className="text-[10px] text-gray-400 whitespace-nowrap">{formatDate(f.lastModified)}</span>
                  <button
                    onClick={() => handleDelete(f.key)}
                    aria-label={`${f.key.replace(currentPrefix, "")}を削除`}
                    className="text-xs text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 rounded"
                  >
                    削除
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Summary */}
        <div className="mt-3 pt-3 border-t border-gray-100 flex justify-between text-xs text-gray-400">
          <span>{files.length}ファイル</span>
          <span>合計: {formatSize(files.reduce((s, f) => s + f.size, 0))}</span>
        </div>
      </Card>

      {/* Lifecycle Policy Status */}
      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-gray-700">ライフサイクルポリシー</h3>
          <div className="flex items-center gap-2">
            {lifecycleLoading && <span className="text-xs text-gray-400 animate-pulse">読み込み中...</span>}
            <button onClick={loadLifecycle} aria-label="ライフサイクル情報を更新" className="text-xs text-[#6EC6FF] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded">更新</button>
          </div>
        </div>

        {lifecycle ? (
          <div className="space-y-4">
            {/* Config info */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-bold text-gray-500 mb-2">ポリシー設定</p>
              <div className="grid grid-cols-3 gap-3 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">圧縮開始:</span>{" "}
                  <span className="font-mono font-bold">{lifecycle.config.compressAfterDays}日</span>
                </div>
                <div>
                  <span className="text-gray-400">削除:</span>{" "}
                  <span className="font-mono font-bold">{lifecycle.config.deleteAfterDays}日</span>
                </div>
                <div>
                  <span className="text-gray-400">Cron:</span>{" "}
                  <span className="font-mono text-[10px]">{lifecycle.config.cronSchedule}</span>
                </div>
              </div>
            </div>

            {/* Storage stats */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">ストレージ使用量</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-blue-600">{lifecycle.stats.totalCount}</p>
                  <p className="text-[10px] text-gray-500">総ファイル数</p>
                  <p className="text-xs text-blue-500 font-mono">{formatSize(lifecycle.stats.totalSize)}</p>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-green-600">{lifecycle.stats.activeCount}</p>
                  <p className="text-[10px] text-gray-500">アクティブ</p>
                  <p className="text-xs text-green-500 font-mono">{formatSize(lifecycle.stats.activeSize)}</p>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-purple-600">{lifecycle.stats.longTermCount}</p>
                  <p className="text-[10px] text-gray-500">長期保存</p>
                  <p className="text-xs text-purple-500 font-mono">{formatSize(lifecycle.stats.longTermSize)}</p>
                </div>
              </div>
            </div>

            {/* Age distribution */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">ファイル経過日数</p>
              <div className="flex gap-1">
                {[
                  { label: "7日未満", count: lifecycle.stats.ageDistribution.recent, color: "bg-green-400" },
                  { label: "7-30日", count: lifecycle.stats.ageDistribution.month, color: "bg-blue-400" },
                  { label: "30-90日", count: lifecycle.stats.ageDistribution.quarter, color: "bg-yellow-400" },
                  { label: "90日-1年", count: lifecycle.stats.ageDistribution.year, color: "bg-orange-400" },
                  { label: "1年以上", count: lifecycle.stats.ageDistribution.old, color: "bg-red-400" },
                ].map((d) => (
                  <div key={d.label} className="flex-1 text-center">
                    <div className={`h-8 rounded-lg ${d.color} flex items-center justify-center`} style={{ opacity: d.count > 0 ? 1 : 0.2 }}>
                      <span className="text-white text-xs font-bold">{d.count}</span>
                    </div>
                    <p className="text-[9px] text-gray-400 mt-1">{d.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* By prefix */}
            {Object.keys(lifecycle.stats.byPrefix).length > 0 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">プレフィックス別</p>
                <div className="space-y-1">
                  {Object.entries(lifecycle.stats.byPrefix)
                    .sort(([, a], [, b]) => b.size - a.size)
                    .map(([prefix, info]) => (
                      <div key={prefix} className="flex items-center justify-between text-xs bg-gray-50 rounded-lg px-3 py-1.5">
                        <span className="font-mono text-gray-600">{prefix}</span>
                        <span className="text-gray-400">{info.count}ファイル / {formatSize(info.size)}</span>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Last run */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">最終実行</p>
              {lifecycle.lastRun ? (
                <div className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">実行日時:</span>
                    <span className="font-mono text-gray-600">{new Date(lifecycle.lastRun.timestamp).toLocaleString("ja-JP")}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-sm font-bold text-gray-700">{lifecycle.lastRun.scanned}</p>
                      <p className="text-[10px] text-gray-400">スキャン</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-blue-600">{lifecycle.lastRun.compressed}</p>
                      <p className="text-[10px] text-gray-400">圧縮/移動</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-red-600">{lifecycle.lastRun.deleted}</p>
                      <p className="text-[10px] text-gray-400">削除</p>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-orange-600">{lifecycle.lastRun.errors}</p>
                      <p className="text-[10px] text-gray-400">エラー</p>
                    </div>
                  </div>
                  {lifecycle.lastRun.details.length > 0 && (
                    <div className="mt-2 max-h-32 overflow-y-auto">
                      {lifecycle.lastRun.details.map((d, i) => (
                        <p key={i} className="text-[10px] text-gray-500 font-mono">{d}</p>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-400 text-center py-3">まだライフサイクル処理は実行されていません</p>
              )}
            </div>

            {/* Run history */}
            {lifecycle.history.length > 1 && (
              <div>
                <p className="text-xs font-bold text-gray-500 mb-2">実行履歴（直近{lifecycle.history.length}回）</p>
                <div className="overflow-x-auto touch-pan-x">
                  <table className="w-full text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-1 text-gray-400">日時</th>
                        <th className="text-center py-1 text-gray-400">スキャン</th>
                        <th className="text-center py-1 text-gray-400">圧縮</th>
                        <th className="text-center py-1 text-gray-400">削除</th>
                        <th className="text-center py-1 text-gray-400">エラー</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...lifecycle.history].reverse().map((run, i) => (
                        <tr key={i} className="border-b border-gray-50">
                          <td className="py-1 font-mono text-gray-500">{new Date(run.timestamp).toLocaleDateString("ja-JP")}</td>
                          <td className="py-1 text-center font-mono">{run.scanned}</td>
                          <td className="py-1 text-center font-mono text-blue-600">{run.compressed}</td>
                          <td className="py-1 text-center font-mono text-red-600">{run.deleted}</td>
                          <td className="py-1 text-center font-mono text-orange-600">{run.errors}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-gray-400 text-center py-4">
            {lifecycleLoading ? "読み込み中..." : "R2が未設定、またはライフサイクルデータがありません"}
          </p>
        )}
      </Card>
    </div>
  );
}
