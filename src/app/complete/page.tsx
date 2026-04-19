"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import JSZip from "jszip";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import LanguageSwitcher from "@/components/ui/LanguageSwitcher";
import { getFrameTemplateForEvent, getStoredEvents, updateAnalyticsRecord } from "@/lib/store";
import { Company, PhotoData } from "@/lib/types";
import { fireWebhook } from "@/lib/webhook";
import { trackPageView, trackPageLeave, trackTap } from "@/lib/tracker";
import { trackOfferView, trackOfferClick, trackCouponView, trackCouponCopy } from "@/lib/offerTracker";

function EmailDownloadSection({ eventName, selectedPhotos }: { eventName: string; selectedPhotos: PhotoData[] }) {
  const t = useTranslations("Complete");
  const [emailName, setEmailName] = useState("");
  const [emailAddr, setEmailAddr] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");

  const handleSendEmail = async () => {
    if (!emailName.trim() || !emailAddr.trim()) {
      setEmailError(t("emailValidation"));
      return;
    }
    setEmailError("");
    setEmailSending(true);

    try {
      const eventId = sessionStorage.getItem("eventId") || "";
      const photoIds = selectedPhotos.map((p) => p.id);
      const res = await fetch("/api/send-download-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: emailName, email: emailAddr, selectedPhotoIds: photoIds, eventId, eventName }),
      });
      if (!res.ok) throw new Error();
      setEmailSent(true);
    } catch {
      setEmailError(t("emailFailed"));
    }
    setEmailSending(false);
  };

  if (emailSent) {
    return (
      <Card className="text-center">
        <p className="text-sm text-green-600 font-medium">
          📧 {t("emailSent", { name: emailName })}
        </p>
        <p className="text-xs text-gray-400 mt-1">{t("emailSentHint")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <p className="text-sm font-bold text-gray-700 mb-2">{t("emailTitle")}</p>
      <p className="text-xs text-gray-400 mb-3">{t("emailDesc")}</p>
      <div className="space-y-2">
        <input
          type="text"
          placeholder={t("emailNamePlaceholder")}
          value={emailName}
          onChange={(e) => setEmailName(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm"
        />
        <input
          type="email"
          placeholder={t("emailPlaceholder")}
          value={emailAddr}
          onChange={(e) => setEmailAddr(e.target.value)}
          className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:border-[#6EC6FF] focus:outline-none text-sm"
        />
        {emailError && <p className="text-xs text-red-400">{emailError}</p>}
        <Button onClick={handleSendEmail} disabled={emailSending} size="sm" variant="secondary" className="w-full">
          {emailSending ? t("emailSending") : t("emailSend")}
        </Button>
      </div>
    </Card>
  );
}


function FrameCanvasPreview({ photo, companyName, eventId }: { photo: PhotoData | null; companyName: string; eventId?: string | null }) {
  const t = useTranslations("Complete");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState(false);
  const frameUrl = useMemo(() => getFrameTemplateForEvent(eventId).url || "/frame-template.svg", [eventId]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !photo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const photoImg = new Image();
    photoImg.crossOrigin = "anonymous";
    photoImg.onload = () => {
      canvas.width = photoImg.naturalWidth;
      canvas.height = photoImg.naturalHeight;
      ctx.drawImage(photoImg, 0, 0);

      const frameImg = new Image();
      frameImg.onload = () => {
        ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
        setDrawn(true);
      };
      frameImg.onerror = () => setDrawn(true);
      frameImg.src = frameUrl;
    };
    photoImg.onerror = () => setDrawn(false);
    photoImg.src = photo.thumbnailUrl;
  }, [frameUrl, photo]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <Card className="text-center">
      <p className="text-xs text-gray-400 mb-2">{t("framePreview")}</p>
      <div className="rounded-xl overflow-hidden">
        {photo ? (
          <canvas
            ref={canvasRef}
            className="w-full h-auto"
            style={{ display: drawn ? "block" : "none" }}
          />
        ) : null}
        {(!photo || !drawn) && (
          <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
            <span className="text-4xl" aria-hidden="true">📷</span>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        📷 {t("frameInfo", { name: companyName })}
      </p>
    </Card>
  );
}

/** Load an image as HTMLImageElement */
function loadImage(src: string, useCors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (useCors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/** Composite photo + event frame template on a canvas and return as PNG Blob */
async function compositeImageBlob(url: string, eventId?: string | null): Promise<Blob> {
  const frameUrl = getFrameTemplateForEvent(eventId).url || "/frame-template.svg";

  // Load photo with CORS (proxy has Access-Control-Allow-Origin header)
  const photoImg = await loadImage(url, true);

  const canvas = document.createElement("canvas");
  canvas.width = photoImg.naturalWidth;
  canvas.height = photoImg.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas context unavailable");

  // Draw photo first
  ctx.drawImage(photoImg, 0, 0);

  // Overlay frame (local SVG, no CORS needed)
  try {
    const frameImg = await loadImage(frameUrl, false);
    ctx.drawImage(frameImg, 0, 0, canvas.width, canvas.height);
  } catch (e) {
    console.warn("[compositeImageBlob] Frame load failed:", e);
  }

  // Export as blob
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/png");
  });
}

/** Download a single blob as a file */
function triggerBlobDownload(blob: Blob, filename: string): void {
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(blobUrl);
}

/** Fallback: download image without frame compositing */
async function downloadImageFallback(url: string, filename: string): Promise<void> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    triggerBlobDownload(blob, filename);
  } catch {
    window.open(url, "_blank");
  }
}

export default function CompletePage() {
  const router = useRouter();
  const t = useTranslations("Complete");
  const [photosDownloaded, setPhotosDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState("");
  const [eventName, setEventName] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [selectedPhotos, setSelectedPhotos] = useState<PhotoData[]>([]);
  const [eventId, setEventId] = useState<string | null>(null);

  // Behavior tracking
  useEffect(() => {
    trackPageView("/complete");
    const enterTime = Date.now();
    return () => trackPageLeave("/complete", enterTime);
  }, []);

  useEffect(() => {
    if (!sessionStorage.getItem("eventId")) router.replace("/");
  }, [router]);

  useEffect(() => {
    setEventId(sessionStorage.getItem("eventId"));
  }, []);

  const platinumCompany = useMemo((): Company | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("platinumCompany") || "null");
    } catch {
      return null;
    }
  }, []);

  const platinumCompanies = useMemo((): Company[] => {
    if (typeof window === "undefined") return [];
    try {
      const arr = JSON.parse(sessionStorage.getItem("platinumCompanies") || "[]");
      if (Array.isArray(arr) && arr.length > 0) return arr.slice(0, 3);
      // Fallback to single platinumCompany
      return platinumCompany ? [platinumCompany] : [];
    } catch {
      return platinumCompany ? [platinumCompany] : [];
    }
  }, [platinumCompany]);

  const matchedCompany = useMemo((): Company | null => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(sessionStorage.getItem("matchedCompany") || "null");
    } catch {
      return null;
    }
  }, []);

  // Track offer/coupon views
  useEffect(() => {
    if (matchedCompany) {
      trackOfferView(matchedCompany.id, matchedCompany.name);
      if (matchedCompany.couponCode) {
        trackCouponView(matchedCompany.id, matchedCompany.name, matchedCompany.couponCode);
      }
    }
  }, [matchedCompany]);

  useEffect(() => {
    setEventName(sessionStorage.getItem("eventName") || "イベント");
    try {
      const ids: string[] = JSON.parse(sessionStorage.getItem("selectedPhotoIds") || "[]");
      setPhotoCount(ids.length);

      // Try to resolve from VLS event data first
      const evtId = sessionStorage.getItem("eventId");
      if (evtId && ids.length > 0) {
        const events = getStoredEvents();
        const event = events.find((e) => e.id === evtId);
        if (event) {
          const photos = event.photos.filter((p) => ids.includes(p.id));
          if (photos.length > 0) {
            setSelectedPhotos(photos);
            return;
          }
        }
      }

      // Fallback: ids are HF Space image_names — create synthetic PhotoData
      if (ids.length > 0) {
        const hfPhotos: PhotoData[] = ids.map((name) => ({
          id: name,
          originalUrl: `/api/proxy/images/${name}`,
          thumbnailUrl: `/api/proxy/images/${name}`,
          timestamp: Date.now(),
          watermarked: false,
        }));
        setSelectedPhotos(hfPhotos);
      }
    } catch {
      setPhotoCount(0);
    }
  }, []);

  const handleDownloadPhotos = async () => {
    if (downloading || selectedPhotos.length === 0) return;
    trackTap("/complete", "download-button");
    setDownloading(true);
    setDownloadProgress("");

    try {
      if (selectedPhotos.length === 1) {
        // Single photo: download as individual PNG
        const photo = selectedPhotos[0];
        const filename = `${eventName}_photo_1.png`;
        try {
          const blob = await compositeImageBlob(photo.originalUrl, eventId);
          triggerBlobDownload(blob, filename);
        } catch (e) {
          console.error("[download] Single photo composite failed:", e);
          await downloadImageFallback(photo.originalUrl, filename);
        }
      } else {
        // Multiple photos: compress into a single ZIP file
        const zip = new JSZip();
        for (let i = 0; i < selectedPhotos.length; i++) {
          const photo = selectedPhotos[i];
          const filename = `${eventName}_photo_${i + 1}.png`;
          setDownloadProgress(`${i + 1} / ${selectedPhotos.length}`);
          try {
            const blob = await compositeImageBlob(photo.originalUrl, eventId);
            zip.file(filename, blob);
          } catch (e) {
            console.warn(`[download] Photo ${i + 1} composite failed, trying fallback:`, e);
            try {
              const res = await fetch(photo.originalUrl);
              const fallbackBlob = await res.blob();
              zip.file(filename, fallbackBlob);
            } catch (e2) {
              console.error(`[download] Photo ${i + 1} skipped:`, e2);
            }
          }
        }
        setDownloadProgress(t("zipping"));
        const zipBlob = await zip.generateAsync({ type: "blob" });
        triggerBlobDownload(zipBlob, `${eventName}_photos.zip`);
      }

      setPhotosDownloaded(true);
    } catch (e) {
      console.error("[download] Download failed:", e);
    } finally {
      setDownloading(false);
      setDownloadProgress("");
    }

    const analyticsId = sessionStorage.getItem("analyticsId");
    if (analyticsId) {
      updateAnalyticsRecord(analyticsId, {
        stepsCompleted: { downloaded: true },
      });
    }
    fireWebhook("download_complete", {
      eventId: sessionStorage.getItem("eventId") || undefined,
      eventName,
      participantName: sessionStorage.getItem("respondentName") || undefined,
      photoCount: selectedPhotos.length,
    });
  };

  return (
    <main className="min-h-screen p-6 pt-10">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Language switcher */}
        <div className="fixed top-4 right-4 z-50">
          <LanguageSwitcher />
        </div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            className="text-5xl mb-3"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            🎉
          </motion.div>
          <h1 className="text-2xl font-bold text-gray-800">
            {t("title")}
          </h1>
          {photoCount > 0 && (
            <p className="text-gray-400 text-sm mt-1" data-testid="photo-count-label">
              {t("selectedCount", { count: photoCount })}
            </p>
          )}
        </motion.div>

        {/* Frame composite preview (Canvas) */}
        {platinumCompany && (
          <FrameCanvasPreview
            photo={selectedPhotos.length > 0 ? selectedPhotos[0] : null}
            companyName={platinumCompany.name}
            eventId={eventId}
          />
        )}

        {/* Download photos */}
        <Card className="text-center">
          <p className="text-sm text-gray-600 mb-3">
            {photoCount > 1
              ? t("downloadMulti", { count: photoCount })
              : t("downloadSingle")}
          </p>
          <Button
            onClick={handleDownloadPhotos}
            disabled={downloading}
            size="lg"
            variant={photosDownloaded ? "secondary" : "primary"}
          >
            {downloading
              ? downloadProgress
                ? `${t("downloading")} (${downloadProgress})`
                : t("downloading")
              : photosDownloaded
                ? t("downloaded")
                : photoCount > 1
                  ? t("downloadZip", { count: photoCount })
                  : t("download")}
          </Button>
        </Card>


        {/* Email download link */}
        <EmailDownloadSection eventName={eventName} selectedPhotos={selectedPhotos} />

        {/* Offer cards */}
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
                  <p className="text-xs text-gray-400">{t("limitedOffer")}</p>
                </div>
              </div>

              <div className="bg-gradient-to-r from-yellow-50 to-pink-50 rounded-xl p-4 mb-3 border border-yellow-100">
                <p className="font-bold text-gray-700">{matchedCompany.offerText}</p>
                {matchedCompany.couponCode && (
                  <p className="text-xs text-gray-500 mt-1">
                    {t("couponCode")}{" "}
                    <code
                      className="bg-white px-2 py-0.5 rounded font-mono cursor-pointer hover:bg-gray-100 transition-colors"
                      role="button"
                      tabIndex={0}
                      aria-label="クーポンコードをコピー"
                      onClick={() => {
                        navigator.clipboard.writeText(matchedCompany.couponCode!).catch(() => {});
                        trackCouponCopy(matchedCompany.id, matchedCompany.name, matchedCompany.couponCode!);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          navigator.clipboard.writeText(matchedCompany.couponCode!).catch(() => {});
                          trackCouponCopy(matchedCompany.id, matchedCompany.name, matchedCompany.couponCode!);
                        }
                      }}
                    >
                      {matchedCompany.couponCode}
                    </code>
                  </p>
                )}
              </div>

              <a
                href={matchedCompany.offerUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="offer-link"
                onClick={() => trackOfferClick(matchedCompany.id, matchedCompany.name)}
              >
                <Button variant="secondary" size="sm" className="w-full">
                  {t("viewDetails")}
                </Button>
              </a>
            </Card>
          </motion.div>
        )}

        {/* Back to top */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center pb-8"
        >
          <button
            onClick={() => (window.location.href = "/")}
            aria-label={t("backToTopAria")}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
          >
            {t("backToTop")}
          </button>
        </motion.div>
      </div>

      {/* Platinum sponsor banner — sticky bottom */}
      {platinumCompanies.length > 0 && (
        <div className="sticky bottom-0 z-10 bg-white/90 backdrop-blur border-t border-gray-100 py-2 px-4">
          <div className="max-w-lg mx-auto flex items-center justify-center gap-4">
            <span className="text-[10px] text-gray-400 flex-shrink-0">{t("sponsors")}</span>
            {platinumCompanies.map((c) => (
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
