import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

/**
 * GET /api/og?eventName=xxx&photoCount=N&sponsor=yyy
 * Dynamic OGP image generation for SNS sharing
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const eventName = searchParams.get("eventName") || "イベント写真";
  const photoCount = searchParams.get("photoCount") || "0";
  const sponsor = searchParams.get("sponsor") || "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "1200px",
          height: "630px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6EC6FF 0%, #A78BFA 50%, #FFB6C1 100%)",
          fontFamily: "sans-serif",
          color: "white",
          position: "relative",
        }}
      >
        {/* Top decoration */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "rgba(255,255,255,0.5)",
          }}
        />

        {/* Camera icon */}
        <div style={{ fontSize: "64px", marginBottom: "16px" }}>📸</div>

        {/* Event name */}
        <div
          style={{
            fontSize: "48px",
            fontWeight: 900,
            textAlign: "center",
            maxWidth: "900px",
            lineHeight: 1.2,
            textShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          {eventName}
        </div>

        {/* Photo count */}
        {Number(photoCount) > 0 && (
          <div
            style={{
              fontSize: "24px",
              marginTop: "12px",
              opacity: 0.9,
              background: "rgba(255,255,255,0.2)",
              padding: "8px 24px",
              borderRadius: "12px",
            }}
          >
            {photoCount}枚の写真をシェア
          </div>
        )}

        {/* Sponsor badge */}
        {sponsor && (
          <div
            style={{
              fontSize: "18px",
              marginTop: "16px",
              opacity: 0.8,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <span>Presented by {sponsor}</span>
          </div>
        )}

        {/* VLS branding */}
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            right: "30px",
            fontSize: "16px",
            opacity: 0.6,
          }}
        >
          VLS System
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
