import { NextRequest, NextResponse } from 'next/server';

const HF_API_URL = process.env.HF_API_URL || process.env.FACENET_API_URL || 'https://ryosukematsuura-face-test-0409.hf.space';
const HF_TOKEN = process.env.HF_TOKEN || '';

/**
 * Proxy API route: forwards requests to Private HF Spaces with authentication
 * Handles: GET /api/proxy/health, GET /api/proxy/db-status, etc.
 * 
 * ※ 顔テスト②からコピー。環境変数のみ FACENET_API_URL もフォールバックに追加。
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const targetUrl = `${HF_API_URL}/${targetPath}${qs ? `?${qs}` : ''}`;

  try {
    const res = await fetch(targetUrl, {
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
      },
      cache: 'no-store',
    });

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('image/')) {
      const buffer = await res.arrayBuffer();
      return new NextResponse(buffer, {
        status: res.status,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Backend API is unavailable' },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const targetPath = path.join('/');

  try {
    const contentType = request.headers.get('content-type') || '';

    let body: BodyInit | null = null;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${HF_TOKEN}`,
    };

    if (contentType.includes('multipart/form-data')) {
      // Forward FormData as-is (for file uploads)
      const formData = await request.formData();
      body = formData;
      // Don't set content-type — fetch will set it with boundary
    } else if (contentType.includes('application/json')) {
      body = await request.text();
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${HF_API_URL}/${targetPath}`, {
      method: 'POST',
      headers,
      body,
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('Proxy POST error:', error);
    return NextResponse.json(
      { error: 'Backend API is unavailable' },
      { status: 502 }
    );
  }
}
