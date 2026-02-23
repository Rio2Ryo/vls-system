"use client";

import { useCallback, useEffect, useState } from "react";
import { CMConfig } from "@/lib/types";
import CMPlayer from "./CMPlayer";

interface CMSegmentManagerProps {
  config: CMConfig;
  onAllComplete: () => void;
}

export default function CMSegmentManager({ config, onAllComplete }: CMSegmentManagerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [allDone, setAllDone] = useState(!config.showCM || config.videoIds.length === 0);

  const handleVideoComplete = useCallback(() => {
    if (currentIndex < config.videoIds.length - 1) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setAllDone(true);
    }
  }, [currentIndex, config.videoIds.length]);

  useEffect(() => {
    if (allDone) {
      onAllComplete();
    }
  }, [allDone, onAllComplete]);

  if (!config.showCM || config.videoIds.length === 0) {
    return null;
  }

  return (
    <div data-testid="cm-segment-manager">
      <div className="text-center mb-4">
        <span className="text-sm text-gray-500">
          セグメント {config.segment} - CM {currentIndex + 1}/{config.videoIds.length}
        </span>
      </div>
      <CMPlayer
        videoId={config.videoIds[currentIndex]}
        duration={config.durations[currentIndex]}
        onComplete={handleVideoComplete}
      />
    </div>
  );
}
