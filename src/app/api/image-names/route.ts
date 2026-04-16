import { NextResponse } from 'next/server';

const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || 'https://ryosukematsuura-face-test-0409.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || '';

// Server-side cache
let cachedNames: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/image-names
 * Fetches all image names from HF Space server-side with PARALLEL requests.
 * 
 * 1. GET /health → db_faces count
 * 2. Calculate pages needed (ceil(count / 500))
 * 3. Fire ALL pages in parallel with Promise.all
 * 4. Aggregate and return unique image names
 * 
 * Result: 17 sequential calls (~5s) → 17 parallel calls (~500ms)
 */
export async function GET() {
  // Return cached if fresh
  if (cachedNames && (Date.now() - cacheTime) < CACHE_TTL) {
    return NextResponse.json({ names: cachedNames, cached: true });
  }

  const headers = { 'Authorization': `Bearer ${HF_TOKEN}` };

  try {
    // Step 1: Get total face count from /health
    const healthRes = await fetch(`${HF_API_URL}/health`, {
      headers,
      cache: 'no-store',
    });

    if (!healthRes.ok) {
      throw new Error(`health failed: ${healthRes.status}`);
    }

    const health = await healthRes.json();
    const totalFaces = health.db_faces || 0;

    if (totalFaces === 0) {
      cachedNames = [];
      cacheTime = Date.now();
      return NextResponse.json({ names: [], cached: false });
    }

    // Step 2: Calculate pages
    const limit = 500;
    const totalPages = Math.ceil(totalFaces / limit);

    // Step 3: Fetch ALL pages in PARALLEL
    const pagePromises = Array.from({ length: totalPages }, (_, i) => {
      const offset = i * limit;
      return fetch(
        `${HF_API_URL}/export-db?offset=${offset}&limit=${limit}`,
        { headers, cache: 'no-store' }
      ).then(async (res) => {
        if (!res.ok) throw new Error(`export-db offset=${offset} failed: ${res.status}`);
        const data = await res.json();
        return data.faces as { image_name: string }[];
      });
    });

    const allPages = await Promise.all(pagePromises);

    // Step 4: Aggregate unique names
    const names = new Set<string>();
    for (const faces of allPages) {
      for (const face of faces) {
        names.add(face.image_name);
      }
    }

    const sorted = Array.from(names).sort();

    // Update cache
    cachedNames = sorted;
    cacheTime = Date.now();

    return NextResponse.json({ names: sorted, cached: false, totalFaces });
  } catch (error) {
    console.error('[image-names] Error:', error);
    if (cachedNames) {
      return NextResponse.json({ names: cachedNames, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to fetch image names' }, { status: 502 });
  }
}
