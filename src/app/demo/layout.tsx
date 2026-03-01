import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "デモ体験",
  description: "VLSのユーザーフローを体験できるデモページ",
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
