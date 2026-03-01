import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "QRスキャン・チェックイン",
  description: "QRコードをスキャンしてイベントにチェックイン",
};

export default function ScanLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
