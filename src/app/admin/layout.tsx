import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "管理画面",
  description: "VLSイベント管理ダッシュボード",
  openGraph: {
    title: "管理画面 | VLS",
    description: "VLSイベント管理ダッシュボード",
  },
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
