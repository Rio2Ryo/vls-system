import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "イベント管理",
  description: "イベントの作成・編集・QRコード管理",
  openGraph: {
    title: "イベント管理 | VLS",
    description: "イベントの作成・編集・QRコード管理",
  },
};

export default function EventsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
