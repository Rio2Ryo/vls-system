"use client";

import useSWR, { SWRConfiguration } from "swr";
import {
  getStoredEvents,
  getStoredCompanies,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredSurvey,
  getStoredParticipants,
  getStoredTenants,
  getStoredInvoices,
  getEventsForTenant,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
  getParticipantsForTenant,
  getInvoicesForTenant,
} from "@/lib/store";
import type { EventData, Company, AnalyticsRecord, VideoPlayRecord, SurveyQuestion, Participant, Tenant, InvoiceData } from "@/lib/types";

/* ── SWR config for localStorage-backed store reads ──
 * dedupingInterval: deduplicate calls within 2s window
 * revalidateOnFocus: refresh when user returns to tab
 * refreshInterval: 0 (manual revalidation via mutate())
 */
const STORE_SWR_CONFIG: SWRConfiguration = {
  dedupingInterval: 2000,
  revalidateOnFocus: true,
  refreshInterval: 0,
  revalidateIfStale: false,
};

/* ── Store data hooks ── */

export function useEvents(tenantId?: string | null) {
  return useSWR<EventData[]>(
    ["store:events", tenantId ?? "all"],
    () => tenantId ? getEventsForTenant(tenantId) : getStoredEvents(),
    STORE_SWR_CONFIG,
  );
}

export function useCompanies() {
  return useSWR<Company[]>("store:companies", getStoredCompanies, STORE_SWR_CONFIG);
}

export function useAnalytics(tenantId?: string | null) {
  return useSWR<AnalyticsRecord[]>(
    ["store:analytics", tenantId ?? "all"],
    () => tenantId ? getAnalyticsForTenant(tenantId) : getStoredAnalytics(),
    STORE_SWR_CONFIG,
  );
}

export function useVideoPlays(tenantId?: string | null) {
  return useSWR<VideoPlayRecord[]>(
    ["store:videoPlays", tenantId ?? "all"],
    () => tenantId ? getVideoPlaysForTenant(tenantId) : getStoredVideoPlays(),
    STORE_SWR_CONFIG,
  );
}

export function useSurvey() {
  return useSWR<SurveyQuestion[]>("store:survey", getStoredSurvey, STORE_SWR_CONFIG);
}

export function useParticipants(tenantId?: string | null) {
  return useSWR<Participant[]>(
    ["store:participants", tenantId ?? "all"],
    () => tenantId ? getParticipantsForTenant(tenantId) : getStoredParticipants(),
    STORE_SWR_CONFIG,
  );
}

export function useTenants() {
  return useSWR<Tenant[]>("store:tenants", getStoredTenants, STORE_SWR_CONFIG);
}

export function useInvoices(tenantId?: string | null) {
  return useSWR<InvoiceData[]>(
    ["store:invoices", tenantId ?? "all"],
    () => tenantId ? getInvoicesForTenant(tenantId) : getStoredInvoices(),
    STORE_SWR_CONFIG,
  );
}

/* ── API fetch hook with SWR ── */

async function apiFetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const API_SWR_CONFIG: SWRConfiguration = {
  dedupingInterval: 5000,
  revalidateOnFocus: true,
  errorRetryCount: 3,
  errorRetryInterval: 1000,
};

export function useApi<T>(url: string | null, config?: SWRConfiguration) {
  return useSWR<T>(url, apiFetcher, { ...API_SWR_CONFIG, ...config });
}
