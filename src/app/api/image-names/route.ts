import { NextResponse } from 'next/server';

const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || 'https://ryosukematsuura-face-test-0409.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || '';

// Server-side cache
let cachedNames: string[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/image-names
 * Calls HF Space /image-names endpoint (returns only names, no embeddings).
 * Single request, ~100ms instead of 17 requests × ~300ms = ~5s.
 */
export async function GET() {
  if (cachedNames && (Date.now() - cacheTime) < CACHE_TTL) {
    return NextResponse.json({ names: cachedNames, cached: true });
  }

  try {
    const res = await fetch(`${HF_API_URL}/image-names`, {
      headers: { 'Authorization': `Bearer ${HF_TOKEN}` },
      cache: 'no-store',
    });

    if (!res.ok) throw new Error(`image-names failed: ${res.status}`);
    const data = await res.json();

    cachedNames = data.names;
    cacheTime = Date.now();

    return NextResponse.json({ names: data.names, cached: false });
  } catch (error) {
    console.error('[image-names] Error:', error);
    if (cachedNames) {
      return NextResponse.json({ names: cachedNames, cached: true, stale: true });
    }
    return NextResponse.json({ error: 'Failed to fetch image names' }, { status: 502 });
  }
}
