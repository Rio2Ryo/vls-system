import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ユーザー管理",
  description: "ユーザーセッションの管理",
  openGraph: {
    title: "ユーザー管理 | VLS",
    description: "ユーザーセッションの管理",
  },
};

export default function UsersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
