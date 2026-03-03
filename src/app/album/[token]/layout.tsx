import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "共有アルバム",
  description: "イベント写真の共有アルバム — パスワード不要でご家族とシェア",
};

export default function AlbumLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
