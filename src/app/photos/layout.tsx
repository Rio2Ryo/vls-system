import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "写真ギャラリー",
  description: "イベントの写真を閲覧・選択してダウンロードできます",
  openGraph: {
    title: "写真ギャラリー | VLS",
    description: "イベントの写真を閲覧・選択してダウンロードできます",
  },
};

export default function PhotosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
