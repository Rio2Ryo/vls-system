import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CSVインポート",
  description: "参加者・イベント・企業のCSV一括インポート",
  openGraph: {
    title: "CSVインポート | VLS",
    description: "参加者・イベント・企業のCSV一括インポート",
  },
};

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return children;
}
