/**
 * HF Spaces FaceNet API Client
 * All API calls go through Next.js API proxy to handle Private Space auth
 * 
 * ※ 顔テスト②からそのままコピー
 */

// In browser: calls go to /api/proxy/* which forwards to HF Spaces
// The proxy handles HF_TOKEN authentication server-side
const PROXY_BASE = '/api/proxy';

export interface FaceResult {
  image_name: string;
  face_index: number;
  bbox: number[];
  similarity: number;
  det_score: number;
}

export interface QueryFaceInfo {
  upload_index: number;
  filename: string;
  status: 'ok' | 'no_face' | 'error';
  message?: string;
  bbox?: number[];
  det_score?: number;
}

export interface SearchResponse {
  query_faces: QueryFaceInfo[];
  results: FaceResult[];
  total_results: number;
  total_matched: number;
  duplicates_removed: number;
  embeddings_used: number;
  threshold: number;
  searchMode?: 'embedding' | 'vision';
  error?: string;
}

export interface DbStatus {
  exists: boolean;
  face_count: number;
  image_count: number;
}

export interface HealthResponse {
  status: string;
  model: string;
  device: string;
  deterministic: boolean;
  db_faces: number;
}

export interface PreprocessStatus {
  running: boolean;
  progress: number;
  total: number;
  current_file: string;
  completed: boolean;
  error: string | null;
  faces_found: number;
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch(`${PROXY_BASE}/health`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

/**
 * Get database status
 */
export async function getDbStatus(): Promise<DbStatus> {
  const res = await fetch(`${PROXY_BASE}/db-status`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`DB status failed: ${res.status}`);
  return res.json();
}

/**
 * Start preprocessing
 */
export async function startPreprocess(): Promise<{ status: string }> {
  const res = await fetch(`${PROXY_BASE}/preprocess`, {
    method: 'POST',
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || `Preprocess start failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Get preprocessing status
 */
export async function getPreprocessStatus(): Promise<PreprocessStatus> {
  const res = await fetch(`${PROXY_BASE}/preprocess/status`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Preprocess status failed: ${res.status}`);
  return res.json();
}

/**
 * Search faces
 */
export async function searchFaces(
  files: File[],
  threshold: number = 0.70,
  maxResults: number = 0
): Promise<SearchResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('images', file);
  });
  formData.append('threshold', threshold.toString());
  formData.append('max_results', maxResults.toString());

  const res = await fetch(`${PROXY_BASE}/search`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || `Search failed: ${res.status}`);
  }
  return data;
}

/**
 * Get face crop URL (via proxy)
 */
export function getFaceCropUrl(imageName: string, faceIndex: number): string {
  return `${PROXY_BASE}/face-crop/${encodeURIComponent(imageName)}/${faceIndex}`;
}

/**
 * Get annotated image URL (via proxy)
 */
export function getAnnotatedImageUrl(imageName: string, faceIndex: number): string {
  return `${PROXY_BASE}/image-annotated/${encodeURIComponent(imageName)}/${faceIndex}`;
}
