"use client";

import { useState, useRef } from "react";

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
  const [tab, setTab] = useState<"reindex" | "list" | "search">("reindex");

  // Reindex state
  const [reindexStatus, setReindexStatus] = useState<"idle" | "loading" | "running" | "done" | "error">("idle");
  const [reindexProgress, setReindexProgress] = useState("");
  const [reindexStats, setReindexStats] = useState<{ indexed: number; total: number } | null>(null);

  // List state
  const [embeddings, setEmbeddings] = useState<EmbeddingRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState("");

  // Search state
  const [searchFile, setSearchFile] = useState<File | null>(null);
  const [searchPreview, setSearchPreview] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Reindex ----
  const handleReindex = async () => {
    setReindexStatus("running");
    setReindexProgress("D1からイベントデータを取得してインデックス中...");
    setReindexStats(null);

    try {
      // photos省略でreindex-insightfaceがD1から自動取得
      const res = await fetch("/api/face/reindex-insightface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, deleteFirst: true }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setReindexStatus("done");
      setReindexStats({ indexed: data.indexedPhotos || 0, total: data.indexedPhotos || 0 });
      setReindexProgress(`完了: ${data.indexedPhotos || 0} 枚をインデックス済み (${data.indexedFaces || 0} 顔)`);
    } catch (e) {
      setReindexStatus("error");
      setReindexProgress(`エラー: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  // ---- List ----
  const handleLoadList = async () => {
    setListLoading(true);
    setListError("");
    try {
      const res = await fetch(`/api/face/list?eventId=${encodeURIComponent(eventId)}&label=insightface-poc&limit=100`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEmbeddings(data.rows || []);
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

      const res = await fetch("/api/face/search-insightface", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          顔検索管理
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          InsightFace (512次元 ArcFace) による高精度顔認識
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
          {(["reindex", "list", "search"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
                tab === t
                  ? "bg-white dark:bg-gray-800 border border-b-white dark:border-b-gray-800 border-gray-200 dark:border-gray-700 text-purple-600"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {t === "reindex" ? "再インデックス" : t === "list" ? "一覧" : "検索テスト"}
            </button>
          ))}
        </div>

        {/* Reindex Tab */}
        {tab === "reindex" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">
              InsightFace 再インデックス
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              イベント内の全写真をInsightFace (512次元) で処理してD1に保存します。
              face-api.js (128次元) より大幅に精度が向上します。
            </p>

            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={handleReindex}
                disabled={reindexStatus === "running" || reindexStatus === "loading"}
                className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold hover:from-purple-600 hover:to-pink-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {reindexStatus === "running" || reindexStatus === "loading"
                  ? "インデックス中..."
                  : "InsightFace 再インデックス実行"}
              </button>
              {(reindexStatus === "running" || reindexStatus === "loading") && (
                <div className="h-5 w-5 rounded-full border-2 border-purple-500 border-t-transparent animate-spin" />
              )}
            </div>

            {reindexProgress && (
              <p className={`text-sm ${
                reindexStatus === "error" ? "text-red-500" :
                reindexStatus === "done" ? "text-green-600 dark:text-green-400" :
                "text-gray-500"
              }`}>
                {reindexProgress}
              </p>
            )}

            {reindexStats && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  ✅ 完了: {reindexStats.indexed} / {reindexStats.total} 枚をインデックスしました
                </p>
                <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                  顔検索UIで検索できるようになりました。
                </p>
              </div>
            )}
          </div>
        )}

        {/* List Tab */}
        {tab === "list" && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100">
                埋め込み一覧 (insightface-poc)
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
              <p className="text-sm text-gray-400">「読み込む」を押してください。インデックスがない場合は再インデックスを実行してください。</p>
            )}

            {embeddings.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-xs text-gray-500 mb-2">{embeddings.length} 件（最大100件）</p>
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
              <p className="text-sm text-gray-400">一致する顔は見つかりませんでした。再インデックスが必要かもしれません。</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
