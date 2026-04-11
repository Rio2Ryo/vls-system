/**
 * Face recognition utilities — cosine similarity, embedding normalization, etc.
 * Used by /api/face/detect and client-side face detection.
 */

/** Cosine similarity between two vectors (returns 0–1, higher = more similar). */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Euclidean distance between two vectors. */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedFace {
  faceIndex: number;
  bbox: FaceBox;
  embedding: number[];
  score: number;
  landmarks?: { x: number; y: number }[];
}

export interface FaceSearchResult {
  photoId: string;
  faceId: string;
  similarity: number;
  bbox?: FaceBox;
}

/** Search stored embeddings for matches above a threshold. */
export function searchEmbeddings(
  query: number[],
  stored: { id: string; photoId: string; embedding: number[]; bbox?: FaceBox }[],
  threshold = 0.7,
): FaceSearchResult[] {
  const results: FaceSearchResult[] = [];
  for (const s of stored) {
    const similarity = cosineSimilarity(query, s.embedding);
    if (similarity >= threshold) {
      results.push({
        photoId: s.photoId,
        faceId: s.id,
        similarity: Math.round(similarity * 10000) / 10000,
        bbox: s.bbox,
      });
    }
  }
  return results.sort((a, b) => b.similarity - a.similarity);
}
