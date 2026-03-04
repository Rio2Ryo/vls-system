"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { addShareEvent } from "@/lib/store";
import type { SharePlatform, ShareEvent } from "@/lib/types";

interface SnsShareButtonsProps {
  eventId: string;
  eventName: string;
  photoCount: number;
  sponsorName?: string;
}

function buildShareUrl(eventName: string, photoCount: number, sponsorName?: string) {
  const base = typeof window !== "undefined" ? window.location.origin : "https://vls-system.vercel.app";
  const ogUrl = `${base}/api/og?eventName=${encodeURIComponent(eventName)}&photoCount=${photoCount}${sponsorName ? `&sponsor=${encodeURIComponent(sponsorName)}` : ""}`;
  return { base, ogUrl };
}

function buildUtm(platform: SharePlatform, eventId: string) {
  return `utm_source=${platform}&utm_medium=social&utm_campaign=photo_share_${eventId}`;
}

function trackShare(eventId: string, platform: SharePlatform, action: "share_click" | "share_complete", photoId?: string) {
  const ev: ShareEvent = {
    id: `share-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    eventId,
    photoId,
    platform,
    action,
    utmSource: platform,
    utmMedium: "social",
    utmCampaign: `photo_share_${eventId}`,
    referrer: typeof document !== "undefined" ? document.referrer : undefined,
    timestamp: Date.now(),
  };
  addShareEvent(ev);
}

export default function SnsShareButtons({ eventId, eventName, photoCount, sponsorName }: SnsShareButtonsProps) {
  const { base } = buildShareUrl(eventName, photoCount, sponsorName);

  const shareText = `${eventName}の写真${photoCount > 0 ? `(${photoCount}枚)` : ""}をチェック！`;
  const shareUrl = `${base}/?${buildUtm("twitter", eventId)}`;

  const handleTwitter = useCallback(() => {
    trackShare(eventId, "twitter", "share_click");
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareUrl)}`;
    window.open(url, "_blank", "width=600,height=400");
    // Track as complete after a delay (best-effort)
    setTimeout(() => trackShare(eventId, "twitter", "share_complete"), 3000);
  }, [eventId, shareText, shareUrl]);

  const handleLine = useCallback(() => {
    trackShare(eventId, "line", "share_click");
    const lineUrl = `${base}/?${buildUtm("line", eventId)}`;
    const url = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(lineUrl)}&text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "width=600,height=400");
    setTimeout(() => trackShare(eventId, "line", "share_complete"), 3000);
  }, [eventId, base, shareText]);

  const handleInstagram = useCallback(() => {
    trackShare(eventId, "instagram", "share_click");
    // Instagram doesn't have a direct web share API — copy link to clipboard
    const igUrl = `${base}/?${buildUtm("instagram", eventId)}`;
    navigator.clipboard.writeText(igUrl).catch(() => {});
    // Show alert for Instagram Story instructions
    alert("リンクをコピーしました！\nInstagram Storyに貼り付けてシェアしてください。");
    setTimeout(() => trackShare(eventId, "instagram", "share_complete"), 3000);
  }, [eventId, base]);

  const handleCopy = useCallback(() => {
    trackShare(eventId, "copy", "share_click");
    const copyUrl = `${base}/?${buildUtm("copy", eventId)}`;
    navigator.clipboard.writeText(copyUrl).then(() => {
      trackShare(eventId, "copy", "share_complete");
    }).catch(() => {});
  }, [eventId, base]);

  const buttons: { platform: SharePlatform; label: string; icon: string; color: string; onClick: () => void }[] = [
    { platform: "twitter", label: "X (Twitter)", icon: "𝕏", color: "#000000", onClick: handleTwitter },
    { platform: "line", label: "LINE", icon: "💬", color: "#06C755", onClick: handleLine },
    { platform: "instagram", label: "Instagram", icon: "📷", color: "#E4405F", onClick: handleInstagram },
    { platform: "copy", label: "リンクコピー", icon: "🔗", color: "#6B7280", onClick: handleCopy },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">SNSでシェア</p>
      <div className="flex justify-center gap-3">
        {buttons.map((btn) => (
          <motion.button
            key={btn.platform}
            onClick={btn.onClick}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg shadow-md transition-shadow hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#6EC6FF]"
            style={{ backgroundColor: btn.color }}
            aria-label={`${btn.label}でシェア`}
            title={btn.label}
          >
            {btn.icon}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
