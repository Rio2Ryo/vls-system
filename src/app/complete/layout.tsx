import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ダウンロード完了",
  description: "写真のダウンロードが完了しました。スポンサーからの特別オファーもご確認ください",
  openGraph: {
    title: "ダウンロード完了 | VLS",
    description: "写真のダウンロードが完了しました。スポンサーからの特別オファーもご確認ください",
  },
};

export default function CompleteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
