"use client";

import { useEffect, useState } from "react";
import Card from "@/components/ui/Card";
import { EventData } from "@/lib/types";
import { getStoredEvents, getEventsForTenant } from "@/lib/store";
import { getAllImageNames } from "@/lib/face-api-client";

interface Props {
  onSave: (msg: string) => void;
  activeEventId: string;
  tenantId?: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function PhotosTab({ onSave: _onSave, activeEventId, tenantId }: Props) {
  const [events, setEvts] = useState<EventData[]>([]);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [hfPhotoCount, setHfPhotoCount] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  useEffect(() => {
    const evts = tenantId ? getEventsForTenant(tenantId) : getStoredEvents();
    setEvts(evts);
    if (activeEventId && evts.find((e) => e.id === activeEventId)) {
      setSelectedEventId(activeEventId);
    } else if (evts.length > 0) {
      setSelectedEventId(evts[0].id);
    }
  }, [activeEventId, tenantId]);

  // Fetch real photo count from HF Space
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCount(true);
      try {
        const names = await getAllImageNames();
        if (!cancelled) setHfPhotoCount(names.length);
      } catch {
        if (!cancelled) setHfPhotoCount(null);
      } finally {
        if (!cancelled) setLoadingCount(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedEventId]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const photoCount = hfPhotoCount ?? selectedEvent?.photos?.length ?? 0;

  return (
    <div className="space-y-4" data-testid="admin-photos">
      <h2 className="text-lg font-bold text-gray-800">写真管理</h2>

      <Card>
        <label className="text-sm font-bold text-gray-600 mb-2 block">対象イベント</label>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 focus:border-[#6EC6FF] focus:outline-none text-center bg-white dark:bg-gray-700 dark:text-gray-100"
          data-testid="photo-event-select"
        >
          {events.map((evt) => (
            <option key={evt.id} value={evt.id}>
              {evt.name} ({evt.id === selectedEventId && hfPhotoCount !== null ? hfPhotoCount : evt.photos.length}枚)
            </option>
          ))}
        </select>
      </Card>

      <Card>
        <div className="text-center py-8">
          <div className="text-5xl mb-3">📷</div>
          <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            {loadingCount ? (
              <span className="text-gray-400">読み込み中...</span>
            ) : (
              <>{photoCount}枚</>
            )}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            登録済み写真
          </p>
        </div>
      </Card>
    </div>
  );
}
