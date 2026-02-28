import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "アンケート分析",
  description: "アンケート回答の分析ダッシュボード",
  openGraph: {
    title: "アンケート分析 | VLS",
    description: "アンケート回答の分析ダッシュボード",
  },
};

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
