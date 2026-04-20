"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { getTenantBySlug, getEventsForTenant } from "@/lib/store";
import { getAllImageNames } from "@/lib/face-api-client";
import type { Tenant, EventData } from "@/lib/types";

export default function TenantPage() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.tenantSlug === "string" ? params.tenantSlug : "";

  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [events, setEvents] = useState<EventData[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [hfPhotoCount, setHfPhotoCount] = useState<number | null>(null);

  useEffect(() => {
    if (!slug) {
      setNotFound(true);
      return;
    }
    const t = getTenantBySlug(slug);
    if (!t) {
      setNotFound(true);
      return;
    }
    setTenant(t);
    const evts = getEventsForTenant(t.id).filter(
      (e) => e.status === "active" || e.status === "ended"
    );
    setEvents(evts);

    // Fetch real photo count from HF Space
    getAllImageNames()
      .then((names) => setHfPhotoCount(names.length))
      .catch(() => {});
  }, [slug]);

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-b from-gray-50 to-white">
        <Card className="w-full max-w-md text-center">
          <div className="text-4xl mb-3">🔍</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">ページが見つかりません</h1>
          <p className="text-sm text-gray-500 mb-4">指定されたテナントは存在しません。</p>
          <Button onClick={() => router.push("/")}>トップページへ</Button>
        </Card>
      </main>
    );
  }

  if (!tenant) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <div className="text-4xl mb-3 animate-pulse">📸</div>
          <p className="text-gray-500 text-sm">読み込み中...</p>
        </div>
      </main>
    );
  }

  const primaryColor = tenant.primaryColor || "#6EC6FF";

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Header */}
      <div
        className="py-8 px-6 text-center text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}dd)` }}
      >
        {tenant.logoUrl && (
          <img
            src={tenant.logoUrl}
            alt={`${tenant.name} ロゴ`}
            className="w-16 h-16 mx-auto mb-3 rounded-full bg-white/20 p-1 object-contain"
          />
        )}
        <motion.h1
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl md:text-3xl font-bold"
        >
          {tenant.name}
        </motion.h1>
        <p className="text-sm mt-2 opacity-80">イベント写真ダウンロードサービス</p>
      </div>

      {/* Events */}
      <div className="max-w-2xl mx-auto px-6 py-8">
        {events.length > 0 ? (
          <>
            <h2 className="text-lg font-bold text-gray-800 mb-4">イベント一覧</h2>
            <div className="space-y-3">
              {events.map((evt, i) => (
                <motion.div
                  key={evt.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                >
                  <div
                    className="cursor-pointer"
                    onClick={() => {
                      sessionStorage.setItem("tenantSlug", slug);
                      if (evt.slug) {
                        router.push(`/e/${evt.slug}`);
                      } else {
                        router.push(`/?pw=${evt.password}`);
                      }
                    }}
                  >
                  <Card className="hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-bold text-gray-800">{evt.name}</h3>
                        <p className="text-xs text-gray-500 mt-0.5">{evt.date} — {evt.description}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                            📷 {evt.id === "evt-summer" && hfPhotoCount != null ? hfPhotoCount : evt.photos.length}枚
                          </span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                            evt.status === "active"
                              ? "bg-green-50 text-green-600"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {evt.status === "active" ? "公開中" : "終了"}
                          </span>
                        </div>
                      </div>
                      <div className="text-2xl">📸</div>
                    </div>
                  </Card>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <Card className="text-center py-12">
            <div className="text-4xl mb-3">📷</div>
            <p className="text-gray-500">現在公開中のイベントはありません</p>
          </Card>
        )}

      </div>
    </main>
  );
}
