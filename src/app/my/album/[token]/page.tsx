"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getStoredEvents, getStoredCompanies } from "@/lib/store";
import { Company, PhotoData } from "@/lib/types";

interface FaceAlbumData {
  eventId: string;
  eventName: string;
  photoIds: string[];
  creatorName: string;
  expiresAt: number;
  viewCount: number;
  sponsorIds: string[];
  matchedCompanyId?: string;
  isFaceAlbum?: boolean;
}

export default function FaceAlbumPage() {
  const params = useParams();
  const token = params.token as string;
  const [status, setStatus] = useState<"loading" | "valid" | "expired" | "error">("loading");
  const [data, setData] = useState<FaceAlbumData | null>(null);
  const [photos, setPhotos] = useState<PhotoData[]>([]);
  const [sponsors, setSponsors] = useState<Company[]>([]);
  const [matchedCompany, setMatchedCompany] = useState<Company | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<PhotoData | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`/api/face/album?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (res.status === 410) {
          setStatus("expired");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const json: FaceAlbumData = await res.json();
        setData(json);
        setStatus("valid");

        const events = getStoredEvents();
        const event = events.find((e) => e.id === json.eventId);
        if (event) {
          setPhotos(event.photos.filter((p) => json.photoIds.includes(p.id)));
        }

        const companies = getStoredCompanies();
        if (json.sponsorIds?.length) {
          setSponsors(companies.filter((c) => json.sponsorIds.includes(c.id)));
        }
        if (json.matchedCompanyId) {
          setMatchedCompany(companies.find((c) => c.id === json.matchedCompanyId) || null);
        }
      })
      .catch(() => setStatus("error"));
  }, [token]);

  const handleClosePreview = useCallback(() => setPreviewPhoto(null), []);

  return (
    <main className="min-h-screen p-6 pt-10 pb-24 bg-gradient-to-b from-purple-50/50 to-white">
      {status === "loading" && (
        <div className="flex flex-col items-center justify-center min-h-[60vh]" role="status" aria-label="読み込み中">
          <div className="inline-flex items-center gap-1.5 mb-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2.5 h-2.5 rounded-full bg-[#A78BFA] animate-bounce"
                style={{ animationDelay: `${i * 0.15}s` }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-400">アルバムを読み込み中...</p>
        </div>
      )}

      {status === "expired" && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-orange-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">アルバムの有効期限が切れています</h1>
            <p className="text-sm text-gray-500">このアルバムは有効期限（30日間）を過ぎています。</p>
          </Card>
        </div>
      )}

      {status === "error" && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Card className="w-full max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-gray-800 mb-2">無効なリンクです</h1>
            <p className="text-sm text-gray-500">このアルバムリンクは無効です。URLをご確認ください。</p>
          </Card>
        </div>
      )}

      {status === "valid" && data && (
        <div className="max-w-lg mx-auto space-y-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-[#6EC6FF] to-[#A78BFA] flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">
              {data.creatorName}さんの写真
            </h1>
            <p className="text-sm text-gray-500 mt-1">{data.eventName}</p>
            <div className="inline-flex items-center gap-1.5 mt-3 px-3 py-1 rounded-full bg-purple-50 text-purple-600 text-xs font-medium">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              顔認識AIで自動生成
            </div>
            <div className="flex items-center justify-center gap-3 mt-2">
              <span className="text-xs text-gray-400">
                {data.viewCount}回閲覧
              </span>
              <span className="text-xs text-gray-400">
                有効期限: {new Date(data.expiresAt).toLocaleDateString("ja-JP")}
              </span>
            </div>
          </motion.div>

          {/* Photo count card */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <Card className="text-center bg-gradient-to-r from-blue-50 to-purple-50 border-0">
              <p className="text-3xl font-bold bg-gradient-to-r from-[#6EC6FF] to-[#A78BFA] bg-clip-text text-transparent">
                {photos.length}枚
              </p>
              <p className="text-xs text-gray-500 mt-1">あなたが写っている写真</p>
            </Card>
          </motion.div>

          {/* Photo grid */}
          {photos.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="grid grid-cols-3 gap-2"
            >
              {photos.map((photo, i) => (
                <button
                  key={photo.id}
                  onClick={() => setPreviewPhoto(photo)}
                  className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#A78BFA]"
                  aria-label={`写真 ${i + 1} を拡大表示`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.thumbnailUrl}
                    alt={`写真 ${i + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform"
                  />
                </button>
              ))}
            </motion.div>
          )}

          {/* Matched company offer */}
          {matchedCompany && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card>
                <div className="flex items-center gap-3 mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={matchedCompany.logoUrl}
                    alt={matchedCompany.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div>
                    <p className="font-bold text-gray-700 text-sm">{matchedCompany.name}</p>
                    <p className="text-xs text-gray-400">スポンサーからのご案内</p>
                  </div>
                </div>
                <div className="bg-gradient-to-r from-yellow-50 to-pink-50 rounded-xl p-4 mb-3 border border-yellow-100">
                  <p className="font-bold text-gray-700">{matchedCompany.offerText}</p>
                  {matchedCompany.couponCode && (
                    <p className="text-xs text-gray-500 mt-1">
                      クーポンコード:{" "}
                      <code className="bg-white px-2 py-0.5 rounded font-mono">
                        {matchedCompany.couponCode}
                      </code>
                    </p>
                  )}
                </div>
                <a href={matchedCompany.offerUrl} target="_blank" rel="noopener noreferrer">
                  <Button variant="secondary" size="sm" className="w-full">
                    詳しく見る
                  </Button>
                </a>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      {/* Photo preview modal */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={handleClosePreview}
          role="dialog"
          aria-label="写真プレビュー"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhoto.originalUrl}
              alt="写真プレビュー"
              className="w-full rounded-xl"
            />
            <button
              onClick={handleClosePreview}
              className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 text-white flex items-center justify-center text-lg hover:bg-black/70 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
              aria-label="プレビューを閉じる"
            >
              ✕
            </button>
          </motion.div>
        </div>
      )}

      {/* Sponsor banner */}
      {status === "valid" && sponsors.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 bg-white/90 backdrop-blur border-t border-gray-100 py-2 px-4" role="contentinfo" aria-label="提供スポンサー">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-4">
            <span className="text-[10px] text-gray-400 flex-shrink-0">提供</span>
            {sponsors.map((c) => (
              <div key={c.id} className="flex items-center gap-1.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.logoUrl} alt={c.name} className="w-6 h-6 rounded-full flex-shrink-0" />
                <span className="text-xs text-gray-600 font-medium hidden sm:inline">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
