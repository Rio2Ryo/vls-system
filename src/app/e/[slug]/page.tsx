"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { getEventBySlug, addAnalyticsRecord } from "@/lib/store";

export default function SlugRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";

  useEffect(() => {
    if (!slug) {
      router.replace("/");
      return;
    }

    const event = getEventBySlug(slug);
    if (!event) {
      router.replace("/?error=invalid-link");
      return;
    }

    // Set session like normal password login
    sessionStorage.setItem("eventId", event.id);
    sessionStorage.setItem("eventName", event.name);
    if (event.companyIds && event.companyIds.length > 0) {
      sessionStorage.setItem("eventCompanyIds", JSON.stringify(event.companyIds));
    } else {
      sessionStorage.removeItem("eventCompanyIds");
    }

    // Create analytics record
    const analyticsId = `a-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sessionStorage.setItem("analyticsId", analyticsId);
    addAnalyticsRecord({
      id: analyticsId,
      eventId: event.id,
      timestamp: Date.now(),
      stepsCompleted: {
        access: true,
        survey: false,
        cmViewed: false,
        photosViewed: false,
        downloaded: false,
      },
    });

    router.replace("/survey");
  }, [slug, router]);

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center">
        <div className="text-4xl mb-3 animate-pulse">📸</div>
        <p className="text-gray-500 text-sm">リダイレクト中...</p>
      </div>
    </main>
  );
}
