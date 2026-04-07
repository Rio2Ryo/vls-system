"use client";

import { useState, useRef } from "react";
import { getCsrfToken } from "@/lib/csrf";

interface EmbeddingRow {
  id: string;
  photo_id: string;
  event_id: string;
  face_index: number;
  label: string;
  det_score?: number;
  created_at: number;
  bbox?: string;
}

interface SearchResult {
  photoId: string;
  faceId: string;
  similarity: number;
  bbox?: { x: number; y: number; width: number; height: number };
}

export default function FaceSearchAdminPage() {
  const [eventId, setEventId] = useState("evt-summer");
  const [tab, setTab] = useState<"search" | "list" | "reindex">("search");

  // List state
  const [embeddings, setEmbeddings] = useState<EmbeddingRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [listTotal, setListTotal] = useState<number | null>(null);

  // Search state
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [searchPreview, setSearchPreview] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Reindex state
  const [reindexStatus, setReindexStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [reindexProgress, setReindexProgress] = useState("");
  const [reindexDetail, setReindexDetail] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- List ----
  const handleLoadList = async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch(`/api/face/list?eventId=${encodeURIComponent(eventId)}&label=facenet&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmbeddings(data.rows || []);
      setListTotal(data.total ?? null);
    } catch (e) {
      setListError(String(e));
    } finally {
      setListLoading(false);
    }
  };

  // ---- Search ----
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSearchFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setSearchPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    setSearchResults([]);
    setSearchError("");
  };

  const handleSearch = async () => {
    if (!searchFile) return;
    setSearching(true);
    setSearchError("");
    setSearchResults([]);

    try {
      const reader = new FileReader();
      const imageBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(searchFile);
      });

      const csrfToken2 = getCsrfToken();
      const res = await fetch("/api/face/search-insightface", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(csrfToken2 ? { "x-csrf-token": csrfToken2 } : {}),
        },
        body: JSON.stringify({
          eventId,
          imageBase64,
          threshold: 0.3,
          limit: 50,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (data.error && data.matchCount === 0) {
        setSearchError(data.error);
      } else {
        setSearchResults(data.results || []);
      }
    } catch (e) {
      setSearchError(String(e));
    } finally {
      setSearching(false);
    }
  };

  // ---- Reindex ----
  const handleReindex = async () => {
    if (!confirm(`VPS FaceNet APIで全写真を再インデックスします。\n既存データは削除されます。続けますか？`)) return;

    setReindexStatus("running");
    setReindexProgress("開始中...");
    setReindexDetail("");

    const BATCH = 10;
    let offset = 0;
    let totalFaces = 0;
    let batchNum = 0;

    try {
      while (true) {
        batchNum++;
        const csrfToken = getCsrfToken();
        const body: Record<string, unknown> = { eventId, offset, batchSize: BATCH };

        setReindexProgress(`バッチ ${batchNum} 処理中... (offset=${offset})`);

        const res = await fetch("/api/face/reindex-insightface", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data = await res.json();
        const faces = data.indexedFaces || 0;
        totalFaces += faces;
        const hasMore = data.hasMore || false;

        setReindexDetail(`バッチ ${batchNum}: ${faces}顔検出 | 合計: ${totalFaces}顔`);

        if (!hasMore) break;
        offset += BATCH;
      }

      setReindexStatus("done");
      setReindexProgress(`完了！ 合計 ${totalFaces} 顔をインデックス済み`);
    } catch (e) {
      setReindexStatus("error");
      setReindexProgress(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          顔検索管理
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          FaceNet-PyTorch (512次元) による高精度顔認識
        </p>

        {/* Event ID input */}
        <div className="mb-6 flex items-center gap-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 whitespace-nowrap">
            イベントID
          </label>
          <input
            type="text"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 flex-1 max-w-xs"
            placeholder="evt-summer"
          />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
          {(["search", "list", "reindex"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === t
                  ? "bg-white dark:bg-gray-800 border border-b-white dark:border-b-gray-800 border-gray-200 dark:border-gray-700 text-purple-600"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t === "list" ? "一覧" : t === "search" ? "検索テスト" : "再インデックス"}
            </button>
          ))}
        </div>

        {/* List Tab */}
        {tab === "list" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                埋め込み一覧
              </h2>
              <button
                onClick={handleLoadList}
                disabled={listLoading}
                className="px-3 py-1.5 text-xs rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                {listLoading ? "読み込み中..." : "読み込む"}
              </button>
            </div>

            {listError && <p className="text-red-500 text-sm mb-2">{listError}</p>}

            {embeddings.length === 0 && !listLoading && (
              <p className="text-sm text-gray-400">「読み込む」を押してください。</p>
            )}

            {embeddings.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-xs text-gray-500 mb-2">{embeddings.length} 件表示（DB総数: {listTotal ?? '?'} 件）</p>
                <table className="w-full text-xs text-gray-700 dark:text-gray-300">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-1 px-2">ID</th>
                      <th className="text-left py-1 px-2">Photo ID</th>
                      <th className="text-left py-1 px-2">Label</th>
                      <th className="text-left py-1 px-2">Face Index</th>
                    </tr>
                  </thead>
                  <tbody>
                    {embeddings.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/50">
                        <td className="py-1 px-2 font-mono text-[10px]">{row.id.slice(0, 20)}…</td>
                        <td className="py-1 px-2">{row.photo_id}</td>
                        <td className="py-1 px-2">
                          <span className="bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-1 rounded text-[10px]">
                            {row.label}
                          </span>
                        </td>
                        <td className="py-1 px-2">{row.face_index}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Search Test Tab */}
        {tab === "search" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-4">
              顔検索テスト
            </h2>

            <div className="mb-4">
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
                検索用の顔写真をアップロード
              </label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="text-sm text-gray-600 dark:text-gray-400 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-purple-100 dark:file:bg-purple-900/40 file:text-purple-700 dark:file:text-purple-300 file:text-xs file:font-medium hover:file:bg-purple-200"
              />
            </div>

            {searchPreview && (
              <div className="mb-4">
                <img
                  src={searchPreview}
                  alt="検索用顔写真"
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-600"
                />
              </div>
            )}

            <button
              onClick={handleSearch}
              disabled={!searchFile || searching}
              className="mb-4 px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {searching ? "検索中..." : "顔検索実行"}
            </button>

            {searchError && (
              <p className="text-red-500 text-sm mb-2">{searchError}</p>
            )}

            {searchResults.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {searchResults.length} 件ヒット
                </p>
                <div className="space-y-2">
                  {searchResults.slice(0, 20).map((r) => (
                    <div
                      key={r.faceId}
                      className="flex items-center gap-3 p-2 rounded bg-gray-50 dark:bg-gray-700/50 text-xs"
                    >
                      <span className={`px-2 py-0.5 rounded font-bold ${
                        r.similarity > 0.6 ? "bg-green-100 text-green-700" :
                        r.similarity > 0.4 ? "bg-yellow-100 text-yellow-700" :
                        "bg-gray-100 text-gray-600"
                      }`}>
                        {Math.round(r.similarity * 100)}%
                      </span>
                      <span className="text-gray-600 dark:text-gray-400 font-mono">{r.photoId}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!searching && searchResults.length === 0 && searchFile && !searchError && (
              <p className="text-sm text-gray-400">一致する顔は見つかりませんでした。</p>
            )}
          </div>
        )}

        {/* Reindex Tab */}
        {tab === "reindex" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">
              FaceNet 再インデックス
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              VPS FaceNet APIで全写真のembeddingを再生成します。10枚ずつバッチ処理するため、ブラウザを閉じないでください。
            </p>

            <button
              onClick={handleReindex}
              disabled={reindexStatus === "running"}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-red-500 to-orange-500 text-white text-sm font-semibold hover:from-red-600 hover:to-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {reindexStatus === "running" ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  インデックス中...
                </span>
              ) : "再インデックス実行"}
            </button>

            {reindexProgress && (
              <p className={`mt-4 text-sm font-medium ${
                reindexStatus === "error" ? "text-red-500" :
                reindexStatus === "done" ? "text-green-600" :
                "text-blue-500"
              }`}>
                {reindexProgress}
              </p>
            )}

            {reindexDetail && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {reindexDetail}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
