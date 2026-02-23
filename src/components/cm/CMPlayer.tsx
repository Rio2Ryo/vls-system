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
      <div className="relative aspect-video rounded-2xl overflow-hidden shadow-xl border-4 border-yellow-300">
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?autoplay=${autoPlay ? 1 : 0}&mute=0&controls=0&rel=0`}
          className="w-full h-full"
          allow="autoplay; encrypted-media"
          allowFullScreen
          title="CM動画"
        />
      </div>
      <div className="mt-3 text-center">
        <span className="inline-block bg-gradient-to-r from-pink-500 to-purple-500 text-white px-4 py-1 rounded-full text-sm font-bold">
          CM再生中... あと {timeLeft}秒
        </span>
      </div>
    </div>
  );
}
