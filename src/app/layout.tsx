import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FAFCFF",
};

export const metadata: Metadata = {
  title: "VLS - イベント写真サービス",
  description: "イベント写真をCM付きで配信・ダウンロードできるサービス",
  openGraph: {
    title: "VLS - イベント写真サービス",
    description: "イベント写真をCM付きで配信・ダウンロードできるサービス",
    type: "website",
    locale: "ja_JP",
  },
  robots: {
    index: false,
    follow: false,
  },
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
