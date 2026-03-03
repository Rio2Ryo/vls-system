"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Card from "@/components/ui/Card";
import AdminHeader from "@/components/admin/AdminHeader";
import {
  getStoredEvents,
  setStoredEvents,
  getEventsForTenant,
  getStoredAnalytics,
  getStoredVideoPlays,
  getStoredParticipants,
  getAnalyticsForTenant,
  getVideoPlaysForTenant,
  getParticipantsForTenant,
} from "@/lib/store";
import { EventData, AnalyticsRecord, VideoPlayRecord, Participant } from "@/lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalendarView = "month" | "week" | "day";

interface CalendarEvent {
  event: EventData;
  dateObj: Date;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  events: CalendarEvent[];
}

interface EventKPI {
  participants: number;
  checkedIn: number;
  checkinRate: number;
  access: number;
  cmCompleted: number;
  cmCompletionRate: number;
  downloaded: number;
  dlRate: number;
}

// ---------------------------------------------------------------------------
// Japanese Holidays (2026)
// ---------------------------------------------------------------------------

const JAPANESE_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "元日",
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-05-06": "振替休日",
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
  "2026-12-23": "天皇誕生日(予備)",
  // 2025
  "2025-01-01": "元日",
  "2025-01-13": "成人の日",
  "2025-02-11": "建国記念の日",
  "2025-02-23": "天皇誕生日",
  "2025-02-24": "振替休日",
  "2025-03-20": "春分の日",
  "2025-04-29": "昭和の日",
  "2025-05-03": "憲法記念日",
  "2025-05-04": "みどりの日",
  "2025-05-05": "こどもの日",
  "2025-05-06": "振替休日",
  "2025-07-21": "海の日",
  "2025-08-11": "山の日",
  "2025-09-15": "敬老の日",
  "2025-09-23": "秋分の日",
  "2025-10-13": "スポーツの日",
  "2025-11-03": "文化の日",
  "2025-11-23": "勤労感謝の日",
  "2025-11-24": "振替休日",
  // 2027
  "2027-01-01": "元日",
  "2027-01-11": "成人の日",
  "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日",
  "2027-03-21": "春分の日",
  "2027-03-22": "振替休日",
  "2027-04-29": "昭和の日",
  "2027-05-03": "憲法記念日",
  "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日",
  "2027-07-19": "海の日",
  "2027-08-11": "山の日",
  "2027-09-20": "敬老の日",
  "2027-09-23": "秋分の日",
  "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日",
  "2027-11-23": "勤労感謝の日",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseEventDate(dateStr: string): Date | null {
  // Support YYYY-MM-DD, YYYY/MM/DD and ISO
  const m = dateStr.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function getMonthDays(year: number, month: number): DayCell[] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const cells: DayCell[] = [];

  // Previous month fill
  const prevMonthDays = new Date(year, month, 0).getDate();
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthDays - i);
    const key = toDateKey(d);
    cells.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, today),
      isHoliday: !!JAPANESE_HOLIDAYS[key],
      holidayName: JAPANESE_HOLIDAYS[key],
      events: [],
    });
  }

  // Current month
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    const key = toDateKey(d);
    const isSun = d.getDay() === 0;
    cells.push({
      date: d,
      isCurrentMonth: true,
      isToday: isSameDay(d, today),
      isHoliday: isSun || !!JAPANESE_HOLIDAYS[key],
      holidayName: JAPANESE_HOLIDAYS[key] || (isSun ? "日曜" : undefined),
      events: [],
    });
  }

  // Next month fill (up to 42 cells = 6 rows)
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    const d = new Date(year, month + 1, i);
    const key = toDateKey(d);
    cells.push({
      date: d,
      isCurrentMonth: false,
      isToday: isSameDay(d, today),
      isHoliday: !!JAPANESE_HOLIDAYS[key],
      holidayName: JAPANESE_HOLIDAYS[key],
      events: [],
    });
  }

  return cells;
}

function getWeekDays(baseDate: Date): DayCell[] {
  const today = new Date();
  const dow = baseDate.getDay();
  const sunday = new Date(baseDate);
  sunday.setDate(baseDate.getDate() - dow);
  const cells: DayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    const key = toDateKey(d);
    cells.push({
      date: d,
      isCurrentMonth: true,
      isToday: isSameDay(d, today),
      isHoliday: d.getDay() === 0 || !!JAPANESE_HOLIDAYS[key],
      holidayName: JAPANESE_HOLIDAYS[key] || (d.getDay() === 0 ? "日曜" : undefined),
      events: [],
    });
  }
  return cells;
}

const DOW_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const EVENT_COLORS = [
  "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
  "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500",
];

function eventColor(idx: number): string {
  return EVENT_COLORS[idx % EVENT_COLORS.length];
}

function calcEventKPI(
  event: EventData,
  participants: Participant[],
  analytics: AnalyticsRecord[],
  videoPlays: VideoPlayRecord[],
): EventKPI {
  const eventParticipants = participants.filter((p) => p.eventId === event.id);
  const eventAnalytics = analytics.filter((a) => a.eventId === event.id);
  const eventVideos = videoPlays.filter((v) => v.eventId === event.id);

  const registered = eventParticipants.length;
  const checkedIn = eventParticipants.filter((p) => p.checkedIn).length;
  const access = eventAnalytics.length;
  const cmCompleted = eventVideos.filter((v) => v.completed).length;
  const downloaded = eventAnalytics.filter((a) => a.stepsCompleted?.downloaded).length;

  return {
    participants: registered,
    checkedIn,
    checkinRate: registered > 0 ? Math.round((checkedIn / registered) * 100) : 0,
    access,
    cmCompleted,
    cmCompletionRate: eventVideos.length > 0 ? Math.round((cmCompleted / eventVideos.length) * 100) : 0,
    downloaded,
    dlRate: access > 0 ? Math.round((downloaded / access) * 100) : 0,
  };
}

// ---------------------------------------------------------------------------
// Drag & Drop context
// ---------------------------------------------------------------------------

interface DragState {
  eventId: string;
  sourceDate: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminCalendarPage() {
  const { data: session } = useSession();
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<EventData[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsRecord[]>([]);
  const [videoPlays, setVideoPlays] = useState<VideoPlayRecord[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventData | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const tenantId = typeof window !== "undefined" ? sessionStorage.getItem("adminTenantId") : null;

  // Load data
  useEffect(() => {
    if (tenantId) {
      setEvents(getEventsForTenant(tenantId));
      setParticipants(getParticipantsForTenant(tenantId));
      setAnalytics(getAnalyticsForTenant(tenantId));
      setVideoPlays(getVideoPlaysForTenant(tenantId));
    } else {
      setEvents(getStoredEvents());
      setParticipants(getStoredParticipants());
      setAnalytics(getStoredAnalytics());
      setVideoPlays(getStoredVideoPlays());
    }
  }, [tenantId]);

  // Map events to calendar
  const calendarEvents = useMemo<CalendarEvent[]>(() => {
    return events
      .map((e) => {
        const d = parseEventDate(e.date);
        return d ? { event: e, dateObj: d } : null;
      })
      .filter(Boolean) as CalendarEvent[];
  }, [events]);

  // Build cells for current view
  const cells = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let dayCells: DayCell[];
    if (view === "month") {
      dayCells = getMonthDays(year, month);
    } else if (view === "week") {
      dayCells = getWeekDays(currentDate);
    } else {
      // day view — single day
      const today = new Date();
      const key = toDateKey(currentDate);
      dayCells = [{
        date: currentDate,
        isCurrentMonth: true,
        isToday: isSameDay(currentDate, today),
        isHoliday: currentDate.getDay() === 0 || !!JAPANESE_HOLIDAYS[key],
        holidayName: JAPANESE_HOLIDAYS[key],
        events: [],
      }];
    }

    // Assign events to cells
    for (const cell of dayCells) {
      cell.events = calendarEvents.filter((ce) => isSameDay(ce.dateObj, cell.date));
    }

    return dayCells;
  }, [currentDate, view, calendarEvents]);

  // Navigation
  const navigate = useCallback((dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const d = new Date(prev);
      if (view === "month") d.setMonth(d.getMonth() + dir);
      else if (view === "week") d.setDate(d.getDate() + dir * 7);
      else d.setDate(d.getDate() + dir);
      return d;
    });
  }, [view]);

  const goToday = useCallback(() => setCurrentDate(new Date()), []);

  // Header label
  const headerLabel = useMemo(() => {
    const y = currentDate.getFullYear();
    const m = currentDate.getMonth() + 1;
    if (view === "month") return `${y}年${m}月`;
    if (view === "week") {
      const dow = currentDate.getDay();
      const sun = new Date(currentDate);
      sun.setDate(currentDate.getDate() - dow);
      const sat = new Date(sun);
      sat.setDate(sun.getDate() + 6);
      return `${sun.getMonth() + 1}/${sun.getDate()} — ${sat.getMonth() + 1}/${sat.getDate()} (${y}年)`;
    }
    return `${y}年${m}月${currentDate.getDate()}日 (${DOW_LABELS[currentDate.getDay()]})`;
  }, [currentDate, view]);

  // Drag & Drop handlers
  const handleDragStart = useCallback((eventId: string, dateStr: string) => {
    setDragState({ eventId, sourceDate: dateStr });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    setDragOverDate(dateStr);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverDate(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetDate: string) => {
    e.preventDefault();
    setDragOverDate(null);
    if (!dragState || dragState.sourceDate === targetDate) {
      setDragState(null);
      return;
    }

    // Update event date
    const fullEvents = getStoredEvents();
    const idx = fullEvents.findIndex((ev) => ev.id === dragState.eventId);
    if (idx === -1) { setDragState(null); return; }

    fullEvents[idx] = { ...fullEvents[idx], date: targetDate };
    setStoredEvents(fullEvents);

    // Update local state
    if (tenantId) {
      setEvents(getEventsForTenant(tenantId));
    } else {
      setEvents(fullEvents);
    }

    setToast(`「${fullEvents[idx].name}」を ${targetDate} に移動しました`);
    setTimeout(() => setToast(null), 3000);
    setDragState(null);
  }, [dragState, tenantId]);

  // KPI for selected event
  const selectedKPI = useMemo(() => {
    if (!selectedEvent) return null;
    return calcEventKPI(selectedEvent, participants, analytics, videoPlays);
  }, [selectedEvent, participants, analytics, videoPlays]);

  // Stats summary
  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = events.filter((e) => {
      const d = parseEventDate(e.date);
      return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const upcoming = events.filter((e) => {
      const d = parseEventDate(e.date);
      return d && d >= new Date(now.getFullYear(), now.getMonth(), now.getDate());
    });
    return {
      total: events.length,
      thisMonth: thisMonth.length,
      upcoming: upcoming.length,
    };
  }, [events]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <p className="text-gray-500">ログインしてください</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-20">
      <AdminHeader title="イベントカレンダー" badge={`${events.length}件`} onLogout={() => signOut({ callbackUrl: "/admin" })} />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 space-y-4">
        {/* KPI summary cards */}
        <div className="grid grid-cols-3 gap-3">
          <Card>
            <div className="text-center py-2">
              <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">{stats.total}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">全イベント</p>
            </div>
          </Card>
          <Card>
            <div className="text-center py-2">
              <p className="text-2xl font-bold" style={{ color: "var(--primary)" }}>{stats.thisMonth}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">今月のイベント</p>
            </div>
          </Card>
          <Card>
            <div className="text-center py-2">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.upcoming}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">今後の予定</p>
            </div>
          </Card>
        </div>

        {/* Calendar toolbar */}
        <Card>
          <div className="flex items-center justify-between flex-wrap gap-2 p-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate(-1)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                aria-label="前へ"
              >
                ◀
              </button>
              <button
                onClick={goToday}
                className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
              >
                今日
              </button>
              <button
                onClick={() => navigate(1)}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                aria-label="次へ"
              >
                ▶
              </button>
              <h2 className="text-sm sm:text-base font-bold text-gray-800 dark:text-gray-100 ml-2">{headerLabel}</h2>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {(["month", "week", "day"] as CalendarView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                    view === v
                      ? "bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                  }`}
                  aria-pressed={view === v}
                >
                  {v === "month" ? "月" : v === "week" ? "週" : "日"}
                </button>
              ))}
            </div>
          </div>
        </Card>

        {/* Calendar Grid */}
        <Card>
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view}-${headerLabel}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {view === "month" && (
                <MonthView
                  cells={cells}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  dragOverDate={dragOverDate}
                  onEventClick={setSelectedEvent}
                  onDayClick={(d) => { setCurrentDate(d); setView("day"); }}
                />
              )}
              {view === "week" && (
                <WeekView
                  cells={cells}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  dragOverDate={dragOverDate}
                  onEventClick={setSelectedEvent}
                  onDayClick={(d) => { setCurrentDate(d); setView("day"); }}
                />
              )}
              {view === "day" && (
                <DayView
                  cell={cells[0]}
                  onEventClick={setSelectedEvent}
                  participants={participants}
                  analytics={analytics}
                  videoPlays={videoPlays}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </Card>

        {/* Event Detail / KPI drill-down modal */}
        <AnimatePresence>
          {selectedEvent && selectedKPI && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
              onClick={() => setSelectedEvent(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{selectedEvent.name}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{selectedEvent.date} {selectedEvent.venue ? `@ ${selectedEvent.venue}` : ""}</p>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded"
                    aria-label="閉じる"
                  >
                    ✕
                  </button>
                </div>

                {selectedEvent.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-300">{selectedEvent.description}</p>
                )}

                {/* KPI Grid */}
                <div className="grid grid-cols-2 gap-3">
                  <KpiCard label="参加者" value={selectedKPI.participants} unit="人" color="text-gray-800 dark:text-gray-100" />
                  <KpiCard label="チェックイン率" value={selectedKPI.checkinRate} unit="%" color="text-blue-600 dark:text-blue-400" />
                  <KpiCard label="アクセス" value={selectedKPI.access} unit="人" color="text-purple-600 dark:text-purple-400" />
                  <KpiCard label="CM完了率" value={selectedKPI.cmCompletionRate} unit="%" color="text-green-600 dark:text-green-400" />
                  <KpiCard label="DL完了" value={selectedKPI.downloaded} unit="人" color="text-orange-600 dark:text-orange-400" />
                  <KpiCard label="DL率" value={selectedKPI.dlRate} unit="%" color="text-pink-600 dark:text-pink-400" />
                </div>

                {/* Status badge */}
                <div className="flex items-center gap-2">
                  <StatusBadge status={selectedEvent.status} />
                  {selectedEvent.photos.length > 0 && (
                    <span className="text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full">
                      写真 {selectedEvent.photos.length}枚
                    </span>
                  )}
                  {selectedEvent.slug && (
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-2 py-0.5 rounded-full font-mono">
                      /e/{selectedEvent.slug}
                    </span>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <a
                    href={`/admin/events`}
                    className="text-xs px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                  >
                    イベント管理へ
                  </a>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="text-xs px-4 py-2 rounded-lg text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF]"
                    style={{ backgroundColor: "var(--primary)" }}
                  >
                    閉じる
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-800 text-white text-sm px-4 py-2.5 rounded-xl shadow-lg"
              role="status"
              aria-live="polite"
            >
              {toast}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function KpiCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>
        {value.toLocaleString()}<span className="text-xs ml-0.5">{unit}</span>
      </p>
      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "公開中", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" },
    expired: { label: "期限切れ", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" },
    archived: { label: "アーカイブ", cls: "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400" },
  };
  const info = map[status || "active"] || map.active;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.cls}`}>{info.label}</span>;
}

// ---------------------------------------------------------------------------
// Month View
// ---------------------------------------------------------------------------

interface ViewProps {
  cells: DayCell[];
  onDragStart: (eventId: string, dateStr: string) => void;
  onDragOver: (e: React.DragEvent, dateStr: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, dateStr: string) => void;
  dragOverDate: string | null;
  onEventClick: (evt: EventData) => void;
  onDayClick: (d: Date) => void;
}

function MonthView({ cells, onDragStart, onDragOver, onDragLeave, onDrop, dragOverDate, onEventClick, onDayClick }: ViewProps) {
  return (
    <div className="p-2">
      {/* DOW header */}
      <div className="grid grid-cols-7 mb-1">
        {DOW_LABELS.map((d, i) => (
          <div
            key={d}
            className={`text-center text-[10px] font-medium py-1 ${
              i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500 dark:text-gray-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-px bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
        {cells.map((cell) => {
          const key = toDateKey(cell.date);
          const dow = cell.date.getDay();
          const isDropTarget = dragOverDate === key;
          return (
            <div
              key={key}
              className={`min-h-[80px] sm:min-h-[100px] p-1 transition-colors ${
                cell.isCurrentMonth
                  ? "bg-white dark:bg-gray-900"
                  : "bg-gray-50/50 dark:bg-gray-900/50"
              } ${isDropTarget ? "ring-2 ring-inset ring-blue-400 bg-blue-50 dark:bg-blue-900/20" : ""}`}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, key)}
            >
              <button
                onClick={() => onDayClick(cell.date)}
                className={`text-[11px] font-medium rounded-full w-6 h-6 flex items-center justify-center mb-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] ${
                  cell.isToday
                    ? "bg-blue-500 text-white"
                    : cell.isHoliday || dow === 0
                    ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    : dow === 6
                    ? "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    : cell.isCurrentMonth
                    ? "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                    : "text-gray-300 dark:text-gray-600"
                }`}
                aria-label={`${cell.date.getMonth() + 1}月${cell.date.getDate()}日${cell.holidayName ? ` (${cell.holidayName})` : ""}`}
              >
                {cell.date.getDate()}
              </button>
              {cell.holidayName && cell.holidayName !== "日曜" && (
                <p className="text-[8px] text-red-400 truncate leading-none mb-0.5">{cell.holidayName}</p>
              )}
              <div className="space-y-0.5">
                {cell.events.slice(0, 3).map((ce, i) => (
                  <div
                    key={ce.event.id}
                    draggable
                    onDragStart={() => onDragStart(ce.event.id, key)}
                    onClick={(e) => { e.stopPropagation(); onEventClick(ce.event); }}
                    className={`${eventColor(i)} text-white text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded truncate cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity`}
                    title={ce.event.name}
                  >
                    {ce.event.name}
                  </div>
                ))}
                {cell.events.length > 3 && (
                  <p className="text-[9px] text-gray-400 pl-1">+{cell.events.length - 3}件</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// (MonthView uses positional index for event color)

// ---------------------------------------------------------------------------
// Week View
// ---------------------------------------------------------------------------

function WeekView({ cells, onDragStart, onDragOver, onDragLeave, onDrop, dragOverDate, onEventClick, onDayClick }: ViewProps) {
  return (
    <div className="p-2">
      <div className="grid grid-cols-7 gap-2">
        {cells.map((cell) => {
          const key = toDateKey(cell.date);
          const dow = cell.date.getDay();
          const isDropTarget = dragOverDate === key;
          return (
            <div
              key={key}
              className={`min-h-[200px] rounded-xl p-2 transition-colors ${
                cell.isToday
                  ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-300 dark:border-blue-700"
                  : "bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800"
              } ${isDropTarget ? "ring-2 ring-blue-400" : ""}`}
              onDragOver={(e) => onDragOver(e, key)}
              onDragLeave={onDragLeave}
              onDrop={(e) => onDrop(e, key)}
            >
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => onDayClick(cell.date)}
                  className={`text-xs font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6EC6FF] rounded px-1 ${
                    dow === 0 || cell.isHoliday ? "text-red-500" : dow === 6 ? "text-blue-500" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {cell.date.getDate()} ({DOW_LABELS[dow]})
                </button>
                {cell.holidayName && cell.holidayName !== "日曜" && (
                  <span className="text-[8px] text-red-400">{cell.holidayName}</span>
                )}
              </div>
              <div className="space-y-1.5">
                {cell.events.map((ce, i) => (
                  <div
                    key={ce.event.id}
                    draggable
                    onDragStart={() => onDragStart(ce.event.id, key)}
                    onClick={() => onEventClick(ce.event)}
                    className={`${eventColor(i)} text-white text-[10px] px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity`}
                  >
                    <p className="font-medium truncate">{ce.event.name}</p>
                    {ce.event.venue && <p className="text-[9px] opacity-80 truncate">{ce.event.venue}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Day View
// ---------------------------------------------------------------------------

interface DayViewProps {
  cell: DayCell;
  onEventClick: (evt: EventData) => void;
  participants: Participant[];
  analytics: AnalyticsRecord[];
  videoPlays: VideoPlayRecord[];
}

function DayView({ cell, onEventClick, participants, analytics, videoPlays }: DayViewProps) {
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className={`text-3xl font-bold ${cell.isHoliday ? "text-red-500" : "text-gray-800 dark:text-gray-100"}`}>
          {cell.date.getDate()}
        </div>
        <div>
          <p className={`text-sm font-medium ${cell.isHoliday ? "text-red-500" : "text-gray-700 dark:text-gray-300"}`}>
            {cell.date.getFullYear()}年{cell.date.getMonth() + 1}月 ({DOW_LABELS[cell.date.getDay()]})
          </p>
          {cell.holidayName && <p className="text-xs text-red-400">{cell.holidayName}</p>}
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          cell.events.length > 0
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
        }`}>
          {cell.events.length}件のイベント
        </span>
      </div>

      {cell.events.length === 0 ? (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-4xl mb-2">📅</p>
          <p className="text-sm">この日にイベントはありません</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cell.events.map((ce, i) => {
            const kpi = calcEventKPI(ce.event, participants, analytics, videoPlays);
            return (
              <motion.div
                key={ce.event.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => onEventClick(ce.event)}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-4 cursor-pointer hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${eventColor(i)}`} />
                    <h4 className="font-bold text-gray-800 dark:text-gray-100">{ce.event.name}</h4>
                  </div>
                  <StatusBadge status={ce.event.status} />
                </div>
                {ce.event.venue && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">📍 {ce.event.venue}</p>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <MiniKpi label="参加者" value={kpi.participants} />
                  <MiniKpi label="チェックイン" value={`${kpi.checkinRate}%`} />
                  <MiniKpi label="CM完了" value={`${kpi.cmCompletionRate}%`} />
                  <MiniKpi label="DL率" value={`${kpi.dlRate}%`} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniKpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="text-center bg-gray-50 dark:bg-gray-900 rounded-lg py-1.5">
      <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{value}</p>
      <p className="text-[9px] text-gray-400">{label}</p>
    </div>
  );
}
