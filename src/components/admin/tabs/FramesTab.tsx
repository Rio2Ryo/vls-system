"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

interface Frame {
  id: string;
  name: string;
  url: string;
  isActive: boolean;
  createdAt: string;
}

const mockFrames: Frame[] = [
  {
    id: "frame-1",
    name: "デフォルトフレーム",
    url: "/frame-template.svg",
    isActive: true,
    createdAt: "2026-03-11",
  },
];

export default function FramesTab() {
  const [frames, setFrames] = useState<Frame[]>(mockFrames);
  const [showTemplateGuide, setShowTemplateGuide] = useState(false);

  const handleSetActive = (id: string) => {
    setFrames(frames.map((f) => ({ ...f, isActive: f.id === id })));
  };

  const handleDelete = (id: string) => {
    if (confirm("このフレームを削除しますか？")) {
      setFrames(frames.filter((f) => f.id !== id));
    }
  };

  const handleUpload = () => {
    // TODO: Implement file upload
    alert("ファイルアップロード機能は開発中です");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-800">フレーム管理</h2>
          <p className="text-sm text-gray-500 mt-1">記念フレームの作成・管理</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setShowTemplateGuide(!showTemplateGuide)}>
            📐 テンプレートガイド
          </Button>
          <Button onClick={handleUpload}>＋ 新規フレーム</Button>
        </div>
      </div>

      {/* Template Guide */}
      {showTemplateGuide && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 border border-blue-200 rounded-xl p-6"
        >
          <h3 className="text-lg font-bold text-blue-800 mb-4">📐 フレームテンプレートガイド</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-bold text-gray-700 mb-2">推奨サイズ</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 解像度: <span className="font-mono bg-white px-2 py-0.5 rounded">1200 × 1600 px</span></li>
                <li>• アスペクト比: <span className="font-mono bg-white px-2 py-0.5 rounded">3:4</span></li>
                <li>• フォーマット: PNG または SVG</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-700 mb-2">配置エリア</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• 写真表示エリア: 中央</li>
                <li>• イベント名: 上部（推奨 40-60px）</li>
                <li>• スポンサーロゴ: 下部（推奨 80-120px）</li>
                <li>• 余白: 各辺 20-40px 確保</li>
              </ul>
            </div>
          </div>

          <div className="mt-4 p-4 bg-white rounded-lg border border-blue-100">
            <h4 className="font-bold text-gray-700 mb-2">🎨 デザインのポイント</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
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

      {/* Frame List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {frames.map((frame) => (
          <Card key={frame.id} className="relative overflow-hidden">
            {frame.isActive && (
              <div className="absolute top-2 right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                使用中
              </div>
            )}
            
            {/* Preview */}
            <div className="aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden mb-3 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={frame.url}
                alt={frame.name}
                className="w-full h-full object-contain"
              />
            </div>

            {/* Info */}
            <h4 className="font-bold text-gray-800">{frame.name}</h4>
            <p className="text-xs text-gray-400 mt-1">作成日: {frame.createdAt}</p>

            {/* Actions */}
            <div className="flex gap-2 mt-3">
              {!frame.isActive && (
                <Button size="sm" onClick={() => handleSetActive(frame.id)}>
                  適用
                </Button>
              )}
              <Button size="sm" variant="secondary" onClick={() => alert("プレビュー機能は開発中です")}>
                プレビュー
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleDelete(frame.id)}
                disabled={frame.isActive}
                className="text-red-600"
              >
                削除
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {frames.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-400">フレームがありません</p>
          <Button className="mt-4" onClick={handleUpload}>
            最初のフレームを作成
          </Button>
        </div>
      )}

      {/* Usage Note */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
        <p className="text-sm text-yellow-800">
          <span className="font-bold">💡 ヒント:</span> 
          フレームはイベントごとに設定できます。イベント設定画面からフレームを選択してください。
        </p>
      </div>
    </div>
  );
}