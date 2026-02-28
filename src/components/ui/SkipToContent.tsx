"use client";

export default function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[9999] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-[#6EC6FF] focus:text-white focus:font-bold focus:text-sm focus:shadow-lg focus:outline-none"
    >
      メインコンテンツへスキップ
    </a>
  );
}
