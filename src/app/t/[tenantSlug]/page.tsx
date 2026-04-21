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
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");

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

    if (!t.userPassword || sessionStorage.getItem("tenantAuthed_" + slug) === "true") {
      setAuthed(true);
    }

    const evts = getEventsForTenant(t.id).filter(
      (e) => e.status === "active" || e.status === "ended"
    );
    setEvents(evts);

    getAllImageNames()
      .then((names) => setHfPhotoCount(names.length))
      .catch(() => {});
  }, [slug]);

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError("");
    const trimmed = password.trim();
    if (!trimmed) {
      setPwError("パスワードを入力してください");
      return;
    }
    if (tenant && trimmed === tenant.userPassword) {
      sessionStorage.setItem("tenantAuthed_" + slug, "true");
      setAuthed(true);
    } else {
      setPwError("パスワードが正しくありません");
    }
  };

  if (notFound) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
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

  // Password screen — matches top page layout
  if (!authed) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center p-6">
        {/* Logo + Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <motion.div
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="mb-3"
          >
            {tenant.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.logoUrl} alt={`${tenant.name} ロゴ`} className="w-20 h-20 mx-auto rounded-full object-contain" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/logo-mirai.svg" alt="ロゴ" className="w-20 h-20 mx-auto" />
            )}
          </motion.div>
          <h1 className="text-3xl md:text-4xl font-black text-[#1a237e]">
            {tenant.name}
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            イベント写真ダウンロードサービス
          </p>
        </motion.div>

        {/* Password Form */}
        <Card className="w-full max-w-md">
          <form onSubmit={handlePasswordSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="tenant-password"
                className="block text-sm font-bold text-gray-600 mb-2"
              >
                アクセスパスワード
              </label>
              <input
                id="tenant-password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="例：SAKURA2026"
                className="w-full px-4 py-3 rounded-xl border border-gray-200
                           focus:border-[#6EC6FF] focus:ring-2 focus:ring-blue-100
                           focus:outline-none text-center text-lg font-mono
                           tracking-wider bg-gray-50/50"
              />
              {pwError && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm mt-2 text-center"
                  role="alert"
                  aria-live="assertive"
                >
                  {pwError}
                </motion.p>
              )}
            </div>

            <div className="text-center">
              <Button type="submit" size="lg">
                写真を見る →
              </Button>
            </div>
          </form>
        </Card>

        {/* Hint */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-xs text-gray-300 mt-6"
        >
          イベント主催者からお知らせされたパスワードを入力してください
        </motion.p>
      </main>
    );
  }

  // Events screen — centered layout
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6">
      {/* Logo + Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="mb-3"
        >
          {tenant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.logoUrl} alt={`${tenant.name} ロゴ`} className="w-20 h-20 mx-auto rounded-full object-contain" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/logo-mirai.svg" alt="ロゴ" className="w-20 h-20 mx-auto" />
          )}
        </motion.div>
        <h1 className="text-3xl md:text-4xl font-black text-[#1a237e]">
          {tenant.name}
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          イベントを選択してください
        </p>
      </motion.div>

      {/* Event Cards */}
      <div className="w-full max-w-md space-y-3">
        {events.length > 0 ? (
          events.map((evt, i) => (
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
                      <p className="text-xs text-gray-500 mt-0.5">{evt.date}</p>
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
          ))
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
