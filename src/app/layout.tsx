import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VLS - Video Launch System",
  description: "イベント写真サービス",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
