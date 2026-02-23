"use client";

import { useEffect, useState } from "react";

interface CMPlayerProps {
  videoId: string;
  duration: number; // seconds
  onComplete: () => void;
  autoPlay?: boolean;
}

export default function CMPlayer({
  videoId,
  duration,
  onComplete,
  autoPlay = true,
}: CMPlayerProps) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    if (!autoPlay) return;

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
  }, [autoPlay, onComplete]);

  return (
    <div className="w-full max-w-2xl mx-auto" data-testid="cm-player">
      <div
        className="relative aspect-video rounded-2xl overflow-hidden shadow-xl"
        style={{
          border: "3px solid #FFD700",
          boxShadow: "0 0 20px rgba(255, 215, 0, 0.3), 0 0 40px rgba(255, 105, 180, 0.1)",
        }}
      >
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoPlay ? 1 : 0}&mute=0&controls=0&rel=0`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="CM動画"
        />
      </div>
      <div className="mt-3 text-center">
        <span
          className="inline-block px-4 py-1 rounded-full text-sm font-bold text-white"
          style={{
            background: "linear-gradient(90deg, #FF69B4, #1A0050)",
            boxShadow: "0 0 10px rgba(255, 105, 180, 0.3)",
          }}
        >
          CM再生中... あと {timeLeft}秒
        </span>
      </div>
    </div>
  );
}
