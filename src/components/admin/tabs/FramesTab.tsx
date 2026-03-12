"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { FrameTemplate } from "@/lib/types";
import { getStoredFrameTemplates, setStoredFrameTemplates } from "@/lib/store";

type EditorMode = "create" | "edit";

const EMPTY_FORM = {
  name: "",
  url: "/frame-template.svg",
};

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("ja-JP");
}

export default function FramesTab() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [frames, setFrames] = useState<FrameTemplate[]>([]);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewFrame, setPreviewFrame] = useState<FrameTemplate | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    setFrames(getStoredFrameTemplates());
  }, []);

  const activeFrame = useMemo(
    () => frames.find((frame) => frame.isActive) ?? frames[0] ?? null,
    [frames],
  );

  const persistFrames = (next: FrameTemplate[]) => {
    setFrames(next);
    setStoredFrameTemplates(next);
  };

  const openCreate = () => {
    setEditorMode("create");
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
    setEditorOpen(true);
  };

  const openEdit = (frame: FrameTemplate) => {
    setEditorMode("edit");
    setEditingId(frame.id);
    setForm({ name: frame.name, url: frame.url });
    setError("");
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleSetActive = (id: string) => {
    persistFrames(frames.map((frame) => ({ ...frame, isActive: frame.id === id, updatedAt: Date.now() })));
  };

  const handleDelete = (id: string) => {
    const target = frames.find((frame) => frame.id === id);
    if (!target) return;
    if (target.isActive) {
      setError("使用中のフレームは削除できません。先に別フレームを適用してください。");
      return;
    }
    if (!confirm(`「${target.name}」を削除しますか？`)) return;
    persistFrames(frames.filter((frame) => frame.id !== id));
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!["image/png", "image/svg+xml", "image/webp"].includes(file.type)) {
      setError("PNG / SVG / WebP のみアップロードできます。");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((prev) => ({
        ...prev,
        name: prev.name || file.name.replace(/\.[^.]+$/, ""),
        url: typeof reader.result === "string" ? reader.result : prev.url,
      }));
      setError("");
    };
    reader.onerror = () => setError("ファイルの読み込みに失敗しました。");
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleSave = () => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("フレーム名を入力してください。");
      return;
    }
    if (!form.url) {
      setError("フレーム画像を選択してください。");
      return;
    }

    const now = Date.now();
    if (editorMode === "edit" && editingId) {
      persistFrames(
        frames.map((frame) =>
          frame.id === editingId
            ? { ...frame, name: trimmedName, url: form.url, updatedAt: now }
            : frame,
        ),
      );
    } else {
      const newFrame: FrameTemplate = {
        id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmedName,
        url: form.url,
        isActive: frames.length === 0,
        createdAt: now,
        updatedAt: now,
      };
      persistFrames([...frames, newFrame]);
    }

    closeEditor();
  };

  return (
    <div className="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.svg,.webp,image/png,image/svg+xml,image/webp"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">フレーム管理</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">記念フレームの作成・管理</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setShowTemplateGuide(!showTemplateGuide)}>
            📐 テンプレートガイド
          </Button>
          <Button onClick={openCreate}>＋ 新規フレーム</Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {activeFrame ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          現在の使用フレーム: <span className="font-bold">{activeFrame.name}</span>
        </div>
      ) : null}

      {showTemplateGuide && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-blue-200 bg-blue-50 p-6">
          <h3 className="mb-4 text-lg font-bold text-blue-800">📐 フレームテンプレートガイド</h3>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h4 className="mb-2 font-bold text-gray-700">推奨サイズ</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• 解像度: <span className="rounded bg-white px-2 py-0.5 font-mono">1200 × 1600 px</span></li>
                <li>• アスペクト比: <span className="rounded bg-white px-2 py-0.5 font-mono">3:4</span></li>
                <li>• フォーマット: PNG / SVG / WebP</li>
              </ul>
            </div>

            <div>
              <h4 className="mb-2 font-bold text-gray-700">配置エリア</h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li>• 写真表示エリア: 中央</li>
                <li>• イベント名: 上部（推奨 40-60px）</li>
                <li>• スポンサーロゴ: 下部（推奨 80-120px）</li>
                <li>• 余白: 各辺 20-40px 確保</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-blue-100 bg-white p-4">
            <h4 className="mb-2 font-bold text-gray-700">🎨 デザインのポイント</h4>
            <div className="grid grid-cols-1 gap-4 text-sm text-gray-600 md:grid-cols-3">
              <div>
                <p className="font-medium text-gray-700">透明領域</p>
                <p>写真が表示される部分は透明にしてください</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">高コントラスト</p>
                <p>文字は背景と十分なコントラストを確保</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">シンプルに</p>
                <p>写真が主役。フレームは控えめに</p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <a href="/frame-template.svg" download className="text-sm text-blue-600 hover:underline">
              📥 サンプルテンプレートをダウンロード
            </a>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {frames.map((frame) => (
          <Card key={frame.id} className="relative overflow-hidden">
            {frame.isActive ? (
              <div className="absolute right-2 top-2 rounded-full bg-green-500 px-2 py-1 text-xs text-white">使用中</div>
            ) : null}

            <div className="mb-3 aspect-[3/4] overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={frame.url} alt={frame.name} className="h-full w-full object-contain" />
            </div>

            <h4 className="font-bold text-gray-800 dark:text-gray-100">{frame.name}</h4>
            <p className="mt-1 text-xs text-gray-400">作成日: {formatDate(frame.createdAt)}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {!frame.isActive ? <Button size="sm" onClick={() => handleSetActive(frame.id)}>適用</Button> : null}
              <Button size="sm" variant="secondary" onClick={() => setPreviewFrame(frame)}>プレビュー</Button>
              <Button size="sm" variant="secondary" onClick={() => openEdit(frame)}>編集</Button>
              <Button size="sm" variant="secondary" disabled={frame.isActive} onClick={() => handleDelete(frame.id)} className="text-red-600">
                削除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {frames.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-400">フレームがありません</p>
          <Button className="mt-4" onClick={openCreate}>最初のフレームを作成</Button>
        </div>
      ) : null}

      <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
        <p className="text-sm text-yellow-800">
          <span className="font-bold">💡 ヒント:</span> 完成ページでダウンロード時に現在の使用フレームが自動適用されます。
        </p>
      </div>

      {editorOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                  {editorMode === "create" ? "新規フレーム作成" : "フレーム編集"}
                </h3>
                <p className="mt-1 text-sm text-gray-500">画像アップロードまたはURL指定でテンプレートを登録できます。</p>
              </div>
              <Button variant="secondary" size="sm" onClick={closeEditor}>閉じる</Button>
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-[1fr_280px]">
              <div className="space-y-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  フレーム名
                  <input
                    className="mt-1 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#6EC6FF] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="例: 卒園式 2026 フレーム"
                  />
                </label>

                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  画像URL
                  <input
                    className="mt-1 w-full rounded-2xl border border-gray-300 px-4 py-3 text-sm outline-none focus:border-[#6EC6FF] dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    value={form.url}
                    onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
                    placeholder="https://... または /frame-template.svg"
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>画像をアップロード</Button>
                  <Button onClick={handleSave}>{editorMode === "create" ? "保存する" : "更新する"}</Button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-200">プレビュー</p>
                <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-dashed border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={form.url || "/frame-template.svg"} alt="preview" className="h-full w-full object-contain" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {previewFrame ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPreviewFrame(null)}>
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-gray-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{previewFrame.name}</h3>
                <p className="text-sm text-gray-500">完成イメージを確認できます</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setPreviewFrame(null)}>閉じる</Button>
            </div>
            <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_280px]">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="https://placehold.co/1200x900/e5e7eb/6b7280/png?text=Sample+Photo" alt="sample" className="h-full w-full object-cover" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewFrame.url} alt={previewFrame.name} className="absolute inset-0 h-full w-full object-contain" />
              </div>
              <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-gray-100 p-2 dark:bg-gray-800">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewFrame.url} alt={previewFrame.name} className="h-full w-full object-contain" />
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
