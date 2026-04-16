import { NextResponse } from 'next/server';

const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || 'https://ryosukematsuura-face-test-0409.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || '';

// Server-side cache: image names don't change often
let cachedNames: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/image-names
 * Fetches all image names from HF Space server-side.
 * Much faster than client-side because:
 * 1. Server-to-HF network is fast (both in cloud)
 * 2. Only returns image names (few KB) vs full embeddings (~30MB)
 * 3. Server-side caching for 5 minutes
 */
export async function GET() {
  // Return cached if fresh
  if (cachedNames && (Date.now() - cacheTime) < CACHE_TTL) {
    return NextResponse.json({ names: cachedNames, cached: true });
  }

  try {
    const names = new Set<string>();
    let offset = 0;
    const limit = 500;

    while (true) {
      const res = await fetch(
        `${HF_API_URL}/export-db?offset=${offset}&limit=${limit}`,
        {
          headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
          cache: 'no-store',
        }
      );

      if (!res.ok) {
        throw new Error(`export-db failed: ${res.status}`);
      }

      const data = await res.json();

      for (const face of data.faces) {
        names.add(face.image_name);
      }

      if (!data.hasMore) break;
      offset += limit;
    }

    const sorted = Array.from(names).sort();

    // Update cache
    cachedNames = sorted;
    cacheTime = Date.now();

    return NextResponse.json({ names: sorted, cached: false });
  } catch (error) {
    console.error('[image-names] Error:', error);
    // Return stale cache if available
    if (cachedNames) {
      return NextResponse.json({ names: cachedNames, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to fetch image names' }, { status: 502 });
  }
}
