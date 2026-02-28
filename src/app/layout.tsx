import type { Metadata, Viewport } from "next";
import AuthProvider from "@/components/providers/SessionProvider";
import DbSyncProvider from "@/components/providers/DbSyncProvider";
import TenantBrandingProvider from "@/components/providers/TenantBrandingProvider";
import DarkModeProvider from "@/components/providers/DarkModeProvider";
import SkipToContent from "@/components/ui/SkipToContent";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#FAFCFF",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://vls-system.vercel.app"),
  title: {
    default: "VLS - イベント写真サービス",
    template: "%s | VLS",
  },
  description: "イベント写真をCM付きで配信・ダウンロードできるサービス",
  openGraph: {
    title: "VLS - イベント写真サービス",
    description: "イベント写真をCM付きで配信・ダウンロードできるサービス",
    type: "website",
    locale: "ja_JP",
    siteName: "VLS - イベント写真サービス",
    url: "https://vls-system.vercel.app",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "VLS - イベント写真サービス" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VLS - イベント写真サービス",
    description: "イベント写真をCM付きで配信・ダウンロードできるサービス",
    images: ["/og-image.png"],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <SkipToContent />
        <AuthProvider>
          <DbSyncProvider>
            <DarkModeProvider>
              <TenantBrandingProvider><div id="main-content">{children}</div></TenantBrandingProvider>
            </DarkModeProvider>
          </DbSyncProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
