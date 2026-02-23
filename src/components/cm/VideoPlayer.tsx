"use client";

import { useEffect, useState } from "react";
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
      data-testid="video-player"
    >
      {label && (
        <p className="text-xs text-gray-400 text-center mb-2">{label}</p>
      )}
      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-md border border-gray-100 bg-black">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=0&controls=0&rel=0&modestbranding=1`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="CM動画"
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
