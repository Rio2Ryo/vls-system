"use client";

import { useEffect } from "react";

type Metric = {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  id: string;
};

function sendToAnalytics(metric: Metric) {
  // Log to console in development
  if (process.env.NODE_ENV === "development") {
    const color =
      metric.rating === "good" ? "\x1b[32m" :
      metric.rating === "needs-improvement" ? "\x1b[33m" : "\x1b[31m";
    console.log(`${color}[WebVitals] ${metric.name}: ${Math.round(metric.value)}ms (${metric.rating})\x1b[0m`);
  }

  // Send to analytics endpoint if available
  if (typeof navigator.sendBeacon === "function") {
    const body = JSON.stringify({
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      id: metric.id,
      page: window.location.pathname,
      timestamp: Date.now(),
    });
    navigator.sendBeacon("/api/vitals", body);
  }
}

export default function WebVitals() {
  useEffect(() => {
    import("web-vitals").then(({ onCLS, onLCP, onFCP, onTTFB, onINP }) => {
      onCLS(sendToAnalytics);
      onLCP(sendToAnalytics);
      onFCP(sendToAnalytics);
      onTTFB(sendToAnalytics);
      onINP(sendToAnalytics);
    }).catch(() => {
      // web-vitals not available — silently ignore
    });
  }, []);

  return null;
}
