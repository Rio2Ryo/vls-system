"use client";

/**
 * Client-side face indexing utility.
 * After photo upload, loads face-api.js in the browser,
 * detects faces, extracts 128-dim embeddings, and POSTs to /api/face/index.
 */

import { getCsrfToken } from "@/lib/csrf";

let modelsLoaded = false;

/** Dynamically load face-api.js (avoids SSR import). */
async function loadFaceApi() {
  const faceapi = await import("face-api.js");
  if (!modelsLoaded) {
    await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
    await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
    await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    modelsLoaded = true;
  }
  return faceapi;
}

/** Load an image as an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface IndexedFace {
  faceIndex: number;
  embedding: number[];
  bbox: { x: number; y: number; width: number; height: number };
  score: number;
}

/**
 * Detect faces in a photo and send embeddings to /api/face/index.
 * Runs entirely in the browser using face-api.js + TensorFlow.js.
 *
 * @param imageUrl - URL or data URL of the photo
 * @param eventId  - Event ID
 * @param photoId  - Photo ID
 * @returns number of faces indexed, or -1 on failure
 */
export async function indexPhotoFaces(
  imageUrl: string,
  eventId: string,
  photoId: string,
): Promise<number> {
  try {
    const faceapi = await loadFaceApi();
    const img = await loadImage(imageUrl);

    // Detect faces with landmarks + descriptors
    const detections = await faceapi
      .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.4 }))
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) return 0;

    const faces: IndexedFace[] = detections.map((d, i) => ({
      faceIndex: i,
      embedding: Array.from(d.descriptor),
      bbox: {
        x: Math.round(d.detection.box.x),
        y: Math.round(d.detection.box.y),
        width: Math.round(d.detection.box.width),
        height: Math.round(d.detection.box.height),
      },
      score: Math.round(d.detection.score * 1000) / 1000,
    }));

    const csrfToken = getCsrfToken();
    const res = await fetch("/api/face/index", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
      },
      body: JSON.stringify({ eventId, photoId, faces }),
    });

    if (!res.ok) return -1;
    const data = await res.json();
    return data.indexed ?? 0;
  } catch (err) {
    console.error("[faceIndex] Failed to index photo faces:", err);
    return -1;
  }
}

/**
 * Index multiple photos in sequence (non-blocking, fire-and-forget).
 * Designed to be called after batch upload completes.
 */
export async function indexBatchPhotoFaces(
  photos: { imageUrl: string; eventId: string; photoId: string }[],
  onProgress?: (current: number, total: number, faces: number) => void,
): Promise<{ total: number; indexed: number; failed: number }> {
  let totalFaces = 0;
  let failed = 0;

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const count = await indexPhotoFaces(p.imageUrl, p.eventId, p.photoId);
    if (count < 0) {
      failed++;
    } else {
      totalFaces += count;
    }
    onProgress?.(i + 1, photos.length, totalFaces);
  }

  return { total: photos.length, indexed: totalFaces, failed };
}
