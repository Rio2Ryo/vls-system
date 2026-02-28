import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CM統計",
  description: "CM動画の視聴統計ダッシュボード",
  openGraph: {
    title: "CM統計 | VLS",
    description: "CM動画の視聴統計ダッシュボード",
  },
};

export default function StatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
