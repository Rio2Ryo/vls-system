import { NextResponse } from 'next/server';

const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || 'https://ryosukematsuura-face-test-0409.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || '';

let cachedNames: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

export async function GET() {
  if (cachedNames && (Date.now() - cacheTime) < CACHE_TTL) {
    return NextResponse.json({ names: cachedNames, cached: true });
  }

  const headers = { 'Authorization': `Bearer ${HF_TOKEN}` };

  try {
    // Try new lightweight endpoint first
    const fastRes = await fetch(`${HF_API_URL}/image-names`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });

    if (fastRes.ok) {
      const data = await fastRes.json();
      cachedNames = data.names;
      cacheTime = Date.now();
      return NextResponse.json({ names: data.names, cached: false });
    }
  } catch {
    // /image-names not available, fall back to export-db
  }

  // Fallback: sequential export-db pagination
  try {
    const names = new Set<string>();
    let offset = 0;
    const limit = 500;

    while (true) {
      const res = await fetch(
        `${HF_API_URL}/export-db?offset=${offset}&limit=${limit}`,
        { headers, cache: 'no-store' }
      );
      if (!res.ok) throw new Error(`export-db failed: ${res.status}`);
      const data = await res.json();

      for (const face of data.faces) {
        names.add(face.image_name);
      }

      if (!data.hasMore) break;
      offset += limit;
    }

    const sorted = Array.from(names).sort();
    cachedNames = sorted;
    cacheTime = Date.now();

    return NextResponse.json({ names: sorted, cached: false });
  } catch (error) {
    console.error('[image-names] Error:', error);
    if (cachedNames) {
      return NextResponse.json({ names: cachedNames, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to fetch image names' }, { status: 502 });
  }
}
