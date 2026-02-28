import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "VLS - イベント写真サービス";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #6EC6FF 0%, #A78BFA 100%)",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 120, marginBottom: 20 }}>📸</div>
        <div
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "white",
            textShadow: "0 2px 10px rgba(0,0,0,0.2)",
            marginBottom: 16,
          }}
        >
          VLS
        </div>
        <div
          style={{
            fontSize: 32,
            color: "rgba(255,255,255,0.9)",
            fontWeight: 500,
          }}
        >
          イベント写真サービス
        </div>
        <div
          style={{
            fontSize: 20,
            color: "rgba(255,255,255,0.7)",
            marginTop: 24,
          }}
        >
          CM動画付き写真配信・ダウンロード
        </div>
      </div>
    ),
    { ...size }
  );
}
