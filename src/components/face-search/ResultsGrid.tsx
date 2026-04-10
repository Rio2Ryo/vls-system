"use client";

import { type FaceResult, getFaceCropUrl } from "@/lib/face-api-client";

function getSimClass(similarity: number): string {
  if (similarity >= 0.7) return "sim-high";
  if (similarity >= 0.55) return "sim-medium";
  return "sim-low";
}

interface ResultsGridProps {
  results: FaceResult[];
  onCardClick: (result: FaceResult) => void;
}

export default function ResultsGrid({ results, onCardClick }: ResultsGridProps) {
  return (
    <div className="results-grid">
      {results.map((result, index) => {
        const simClass = getSimClass(result.similarity);
        const simPercent = Math.round(result.similarity * 100);
        const simBarWidth = Math.max(0, (result.similarity - 0.3) / 0.7 * 100);

        return (
          <div
            key={`${result.image_name}-${result.face_index}`}
            className={`result-card ${simClass}`}
            onClick={() => onCardClick(result)}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="face-img"
              src={getFaceCropUrl(result.image_name, result.face_index)}
              alt={`Face from ${result.image_name}`}
              loading="lazy"
            />
            <div className="result-info">
              <div className="similarity-bar">
                <div
                  className="similarity-fill"
                  style={{ width: `${simBarWidth}%` }}
                />
              </div>
              <div className="similarity-score">{simPercent}%</div>
              <div className="image-name" title={result.image_name}>
                {result.image_name}
              </div>
              <div className="face-tag">
                Face #{result.face_index} · 検出 {(result.det_score * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
