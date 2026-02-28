import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ダウンロード準備中",
  description: "高画質写真データを生成中です",
  openGraph: {
    title: "ダウンロード準備中 | VLS",
    description: "高画質写真データを生成中です",
  },
};

export default function DownloadingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
