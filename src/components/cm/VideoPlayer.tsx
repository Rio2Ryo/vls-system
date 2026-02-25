"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { addVideoPlayRecord } from "@/lib/store";
import { VideoPlayRecord } from "@/lib/types";

interface VideoPlayerProps {
  videoId: string;
  duration: number;
  label?: string;
  onComplete: () => void;
  /** Optional tracking metadata — if provided, a VideoPlayRecord is saved */
  tracking?: {
    companyId: string;
    companyName: string;
    cmType: VideoPlayRecord["cmType"];
    eventId: string;
  };
}

export default function VideoPlayer({
  videoId,
  duration,
  label,
  onComplete,
  tracking,
}: VideoPlayerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const [muted, setMuted] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const startTimeRef = useRef(Date.now());
  const completedRef = useRef(false);

  useEffect(() => {
    startTimeRef.current = Date.now();
    completedRef.current = false;
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          completedRef.current = true;
          // Record video play on completion
          if (tracking) {
            const watchedMs = Date.now() - startTimeRef.current;
            addVideoPlayRecord({
              id: `vp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              companyId: tracking.companyId,
              companyName: tracking.companyName,
              videoId,
              cmType: tracking.cmType,
              duration,
              watchedSeconds: Math.round(watchedMs / 1000),
              completed: true,
              timestamp: Date.now(),
              eventId: tracking.eventId,
            });
          }
          onComplete();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      clearInterval(timer);
      // Record partial view on unmount only if not already completed
      if (tracking && !completedRef.current) {
        const watchedMs = Date.now() - startTimeRef.current;
        const watchedSec = Math.round(watchedMs / 1000);
        if (watchedSec >= 2) {
          addVideoPlayRecord({
            id: `vp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            companyId: tracking.companyId,
            companyName: tracking.companyName,
            videoId,
            cmType: tracking.cmType,
            duration,
            watchedSeconds: watchedSec,
            completed: false,
            timestamp: Date.now(),
            eventId: tracking.eventId,
          });
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleMute = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        JSON.stringify({
          event: "command",
          func: muted ? "unMute" : "mute",
          args: [],
        }),
        "*"
      );
    }
    setMuted(!muted);
  };

  // YouTube params — start muted for reliable autoplay across all browsers
  const ytParams = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    disablekb: "1",
    modestbranding: "1",
    rel: "0",
    iv_load_policy: "3",
    showinfo: "0",
    fs: "0",
    playsinline: "1",
    enablejsapi: "1",
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
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?${ytParams}`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          title="CM動画"
          tabIndex={-1}
        />
        {/* Overlay to block direct video interaction + unmute control */}
        <div
          className="absolute inset-0 z-10"
          style={{ pointerEvents: "all" }}
          onContextMenu={(e) => e.preventDefault()}
          data-testid="video-overlay"
        >
          <button
            onClick={toggleMute}
            className="absolute bottom-3 left-3 flex items-center gap-1.5 px-3 py-1.5
                       rounded-full bg-black/60 text-white text-xs font-medium
                       hover:bg-black/80 transition-colors backdrop-blur-sm
                       border border-white/20"
            data-testid="video-mute-btn"
          >
            <span className="text-sm">{muted ? "\uD83D\uDD07" : "\uD83D\uDD0A"}</span>
            {muted ? "タップで音声ON" : "ミュート"}
          </button>
        </div>
      </div>
      <div className="mt-2 text-center">
        <span className="text-xs text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
          あと {timeLeft}秒
        </span>
      </div>
    </motion.div>
  );
}
