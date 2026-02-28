import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "読み込み中",
  description: "イベント写真データとCM動画を読み込んでいます",
  openGraph: {
    title: "読み込み中 | VLS",
    description: "イベント写真データとCM動画を読み込んでいます",
  },
};

export default function ProcessingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
