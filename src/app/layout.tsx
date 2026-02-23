import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLS - Video Launch System",
  description: "イベント写真マッチングシステム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="bg-magical min-h-screen relative z-10">{children}</body>
    </html>
  );
}
