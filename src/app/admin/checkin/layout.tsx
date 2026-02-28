import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "チェックイン",
  description: "イベント参加者のチェックイン管理",
  openGraph: {
    title: "チェックイン | VLS",
    description: "イベント参加者のチェックイン管理",
  },
};

export default function CheckinLayout({ children }: { children: React.ReactNode }) {
  return children;
}
