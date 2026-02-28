import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "アンケート",
  description: "イベントアンケートに回答して、あなたに合ったコンテンツを受け取りましょう",
  openGraph: {
    title: "アンケート | VLS",
    description: "イベントアンケートに回答して、あなたに合ったコンテンツを受け取りましょう",
  },
};

export default function SurveyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
