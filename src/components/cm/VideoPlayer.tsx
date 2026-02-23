"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface VideoPlayerProps {
  videoId: string;
  duration: number;
  label?: string;
  onComplete: () => void;
}

export default function VideoPlayer({
  videoId,
  duration,
  label,
  onComplete,
}: VideoPlayerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onComplete, duration]);

  // Block keyboard shortcuts that could affect the iframe video
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Block space (play/pause), arrow keys (seek), k (pause), m (mute), f (fullscreen)
      const blockedKeys = [" ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "k", "m", "f", "j", "l"];
      if (blockedKeys.includes(e.key)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  // YouTube params to restrict user control
  const ytParams = new URLSearchParams({
    autoplay: "1",
    mute: "0",
    controls: "0",
    disablekb: "1",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    showinfo: "0",
    fs: "0",
    playsinline: "1",
  }).toString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
      data-testid="video-player"
      ref={containerRef}
    >
      {label && (
        <p className="text-xs text-gray-400 text-center mb-2">{label}</p>
      )}
      <div
        className="relative aspect-video rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-black"
        onContextMenu={(e) => e.preventDefault()}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?${ytParams}`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          title="CM動画"
          tabIndex={-1}
        />
        {/* Transparent overlay to block all clicks on the video */}
        <div
          className="absolute inset-0 z-10"
          style={{ pointerEvents: "all" }}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="video-overlay"
        />
      </div>
      <div className="mt-2 text-center">
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
          あと {timeLeft}秒
        </span>
      </div>
    </motion.div>
  );
}
