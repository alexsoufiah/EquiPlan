"use client";
import React, { useEffect, useState, useRef, useCallback } from "react";
import { use } from "react";
import { Trophy, MapPin, Clock, ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { useLang } from "@/lib/i18n";

interface Arena { id: number; name: string; }
interface Team { id: number; name: string; }
interface Entry {
  id: number; date: string; start_time: string; end_time: string;
  title: string; phase: string; pruefungs_id?: string; notes?: string;
  arena_id?: number; arena_name?: string;
  speaker_name?: string; speaker_role?: string; speaker_color?: string;
  teams: Team[];
  helpers_needed?: number;
  helpers_task?: string;
  helpers_signed_up?: number;
  delay_minutes?: number; // Einzel-Verspätung am Eintrag
  orig_start?: string; // gesetzt bei Verspätung
  orig_end?: string;
}
interface Tournament { id: number; name: string; location?: string; start_date?: string; end_date?: string; }

// ── Phasen-Farben ─────────────────────────────────────────────────────────────
// Liste-Ansicht (hell = besser lesbar auf dunklem Hintergrund)
const PHASE_LIST: Record<string, { bg: string; border: string; text: string; label: string; dot: string }> = {
  aufbau:       { bg: "bg-orange-900",  border: "border-orange-500",  text: "text-orange-100",  label: "Aufbau",       dot: "bg-orange-400" },
  wettkampf:    { bg: "bg-blue-900",    border: "border-blue-500",    text: "text-blue-100",    label: "Wettkampf",    dot: "bg-blue-400" },
  siegerehrung: { bg: "bg-yellow-900",  border: "border-yellow-500",  text: "text-yellow-100",  label: "Siegerehrung", dot: "bg-yellow-400" },
  abbau:        { bg: "bg-purple-900",  border: "border-purple-500",  text: "text-purple-100",  label: "Abbau",        dot: "bg-purple-400" },
  pause:        { bg: "bg-gray-800",    border: "border-gray-600",    text: "text-gray-200",    label: "Pause",        dot: "bg-gray-400" },
};

// Timeline-Ansicht
const PHASE_TL: Record<string, { bg: string; border: string; text: string }> = {
  aufbau:       { bg: "bg-orange-800", border: "border-l-orange-400", text: "text-orange-100" },
  wettkampf:    { bg: "bg-blue-800",   border: "border-l-blue-400",   text: "text-blue-100" },
  siegerehrung: { bg: "bg-yellow-800", border: "border-l-yellow-400", text: "text-yellow-100" },
  abbau:        { bg: "bg-purple-800", border: "border-l-purple-400", text: "text-purple-100" },
  pause:        { bg: "bg-gray-700",   border: "border-l-gray-400",   text: "text-gray-100" },
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────
function nowDate() { return new Date(); }
function isRunning(e: Entry) {
  const n = nowDate();
  return new Date(`${e.date}T${e.start_time}`) <= n && new Date(`${e.date}T${e.end_time}`) > n;
}
function isDone(e: Entry) { return new Date(`${e.date}T${e.end_time}`) < nowDate(); }
function formatDateShort(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" });
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
function addMinutesToTime(hhmm: string, min: number): string {
  const total = toMinutes(hhmm) + min;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}
// Verspätung auf Einträge anwenden: Zeiten verschieben, Original merken.
// Einzel-Verspätung (delay_minutes am Eintrag) hat Vorrang vor Platz-/Tages-Verspätung.
function applyDelays(entries: Entry[], delays: { arena_id: number; minutes: number }[]): Entry[] {
  const map: Record<number, number> = {};
  for (const d of delays) map[d.arena_id] = d.minutes;
  return entries.map(e => {
    const single = e.delay_minutes ?? 0;
    const d = single > 0 ? single : ((e.arena_id != null && map[e.arena_id] != null) ? map[e.arena_id] : (map[0] ?? 0));
    if (!d) return e;
    return { ...e, orig_start: e.start_time, orig_end: e.end_time, start_time: addMinutesToTime(e.start_time, d), end_time: addMinutesToTime(e.end_time, d) };
  });
}

const PX_PER_HOUR = 96;
const PX_PER_MIN = PX_PER_HOUR / 60;

// ── Timeline-Komponente (dunkel) ──────────────────────────────────────────────
function ShareTimeline({ entries, selectedDate }: { entries: Entry[]; selectedDate: string }) {
  const [nowTs, setNowTs] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNowTs(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Plätze sammeln
  const arenaMap = new Map<number | null, string>();
  for (const e of entries) {
    if (e.arena_id != null) arenaMap.set(e.arena_id, e.arena_name ?? `Platz ${e.arena_id}`);
    else arenaMap.set(null, "– Kein Platz –");
  }
  const arenaCols: { id: number | null; name: string }[] = [];
  const sortedKeys = [...arenaMap.keys()].sort((a, b) => a == null ? 1 : b == null ? -1 : (a as number) - (b as number));
  for (const k of sortedKeys) arenaCols.push({ id: k, name: arenaMap.get(k)! });

  // Zeitbereich
  let dayStart = 7 * 60;
  let dayEnd = 21 * 60;
  if (entries.length > 0) {
    const starts = entries.map(e => toMinutes(e.start_time));
    const ends = entries.map(e => toMinutes(e.end_time));
    dayStart = Math.floor(Math.min(...starts) / 60) * 60;
    dayEnd = Math.ceil(Math.max(...ends) / 60) * 60;
    dayStart = Math.max(0, dayStart - 30);
    dayEnd = Math.min(24 * 60, dayEnd + 30);
  }
  const totalMinutes = dayEnd - dayStart;
  const totalHeight = totalMinutes * PX_PER_MIN;

  const hourLines: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hourLines.push(m);

  const isToday = selectedDate === todayStr();
  const nowMinutes = nowTs.getHours() * 60 + nowTs.getMinutes();
  const showNowLine = isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd;
  const nowTop = (nowMinutes - dayStart) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10 bg-gray-900/60">
      <div className="flex min-w-max">
        {/* Zeitachse */}
        <div className="w-14 shrink-0 relative" style={{ height: totalHeight + 40 }}>
          <div className="h-10 border-b border-white/10" />
          <div className="relative" style={{ height: totalHeight }}>
            {hourLines.map(m => (
              <div key={m} className="absolute left-0 right-0 flex items-center" style={{ top: (m - dayStart) * PX_PER_MIN }}>
                <span className="text-[10px] text-gray-500 px-1.5 font-mono leading-none">
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Spalten */}
        {arenaCols.map(arena => {
          const col = entries.filter(e => (e.arena_id ?? null) === arena.id);
          return (
            <div key={String(arena.id)} className="flex-1 min-w-[180px] border-l border-white/10">
              {/* Header */}
              <div className="h-10 flex items-center justify-center border-b border-white/10 bg-indigo-900/30 px-2">
                <span className="text-xs font-semibold text-indigo-200 truncate text-center">📍 {arena.name}</span>
              </div>
              {/* Inhalt */}
              <div className="relative" style={{ height: totalHeight }}>
                {hourLines.map(m => (
                  <div key={m} className="absolute left-0 right-0 border-t border-white/5"
                    style={{ top: (m - dayStart) * PX_PER_MIN }} />
                ))}
                {/* Jetzt-Linie */}
                {showNowLine && (
                  <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top: nowTop }}>
                    <div className="h-0.5 bg-red-400 w-full shadow-[0_0_6px_rgba(248,113,113,0.8)]" />
                    <div className="absolute -top-1.5 -left-1 w-3 h-3 bg-red-400 rounded-full shadow-[0_0_8px_rgba(248,113,113,0.9)]" />
                  </div>
                )}
                {/* Einträge */}
                {col.map(entry => {
                  const startMin = toMinutes(entry.start_time);
                  const endMin = toMinutes(entry.end_time);
                  const duration = Math.max(endMin - startMin, 15);
                  const top = (startMin - dayStart) * PX_PER_MIN;
                  const height = Math.max(duration * PX_PER_MIN, 28);
                  const done = isDone(entry);
                  const running = isRunning(entry);
                  const tl = PHASE_TL[entry.phase] ?? PHASE_TL.pause;

                  let cls = `absolute left-1 right-1 rounded-lg border-l-4 px-1.5 py-1 overflow-hidden z-10 shadow-sm ${tl.bg} ${tl.border} ${tl.text}`;
                  if (done) cls += " opacity-35";
                  if (running) cls += " ring-2 ring-violet-400 shadow-[0_0_14px_rgba(167,139,250,0.6)]";

                  return (
                    <div key={entry.id} className={cls} style={{ top, height }}
                      title={`${entry.pruefungs_id ? entry.pruefungs_id + " · " : ""}${entry.title}\n${entry.start_time}–${entry.end_time}${entry.teams?.length ? "\n" + entry.teams.map(t => t.name).join(", ") : ""}`}>
                      {running && (
                        <div className="absolute top-0.5 right-0.5">
                          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping block" />
                        </div>
                      )}
                      <div className="font-semibold leading-tight truncate" style={{ fontSize: height < 36 ? "9px" : "11px" }}>
                        {entry.pruefungs_id && <span className="opacity-60 mr-1">{entry.pruefungs_id}</span>}
                        {entry.title}
                      </div>
                      {height >= 36 && (
                        <div className="font-mono opacity-80" style={{ fontSize: "9px" }}>{entry.start_time}–{entry.end_time}</div>
                      )}
                      {height >= 52 && entry.teams?.length > 0 && (
                        <div className="truncate opacity-75" style={{ fontSize: "9px" }}>
                          👥 {entry.teams.map(t => t.name).join(", ")}
                        </div>
                      )}
                      {height >= 64 && entry.speaker_name && (
                        <div className="truncate" style={{ fontSize: "9px" }}>
                          <span className="rounded px-1 text-white" style={{ backgroundColor: entry.speaker_color || "#4B5563" }}>
                            🎙 {entry.speaker_name}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legende */}
      <div className="border-t border-white/10 px-4 py-2 flex flex-wrap gap-3 text-xs text-gray-400 bg-black/20">
        {Object.entries(PHASE_LIST).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-sm border-l-2 ${PHASE_TL[k].border} ${PHASE_TL[k].bg}`} />
            <span className="text-gray-300">{v.label}</span>
          </span>
        ))}
        {showNowLine && (
          <span className="flex items-center gap-1.5 text-red-400 font-semibold">
            <span className="w-2.5 h-0.5 bg-red-400 inline-block rounded" /> Jetzt
          </span>
        )}
      </div>
    </div>
  );
}

// ── Hauptseite ────────────────────────────────────────────────────────────────
export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { lang, setLang } = useLang();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedArena, setSelectedArena] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [error, setError] = useState("");
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const [helperEntry, setHelperEntry] = useState<Entry | null>(null);
  const [internal, setInternal] = useState(false);
  const [contacts, setContacts] = useState<{ id: number; name: string; role?: string; phone?: string }[]>([]);
  const [showInfo, setShowInfo] = useState(false);
  const currentRef = useRef<HTMLDivElement>(null);

  // Globale Body-Sperre (für die fixierte Haupt-App) hier aufheben, damit die
  // Share-Seite normal scrollt – die Header bleiben per sticky stehen.
  useEffect(() => {
    const html = document.documentElement, body = document.body;
    const prev = [html.style.cssText, body.style.cssText];
    for (const el of [html, body]) {
      el.style.overflow = "auto";
      el.style.position = "static";
      el.style.height = "auto";
    }
    return () => { html.style.cssText = prev[0]; body.style.cssText = prev[1]; };
  }, []);

  function onHelperSignedUp(entryId: number) {
    setEntries(prev => prev.map(e =>
      e.id === entryId ? { ...e, helpers_signed_up: (e.helpers_signed_up ?? 0) + 1 } : e
    ));
  }

  // Refs für Closure-sichere Werte
  const selectedDateRef = useRef(selectedDate);
  const selectedArenaRef = useRef(selectedArena);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);
  useEffect(() => { selectedArenaRef.current = selectedArena; }, [selectedArena]);

  const load = useCallback(async (arenaId?: number | null, date?: string) => {
    const p = new URLSearchParams();
    if (date) p.set("date", date);
    if (arenaId) p.set("arena_id", String(arenaId));
    const res = await fetch(`/api/public/${token}?${p}`);
    if (!res.ok) { setError("Link ungültig oder abgelaufen."); return; }
    const data = await res.json();
    setTournament(data.tournament);
    setArenas(data.arenas);
    setDates(data.dates);
    if (!date && data.dates.length > 0) {
      const t = todayStr();
      setSelectedDate(data.dates.includes(t) ? t : data.dates[0]);
    }
    const adjusted = applyDelays(data.entries as Entry[], data.delays ?? []);
    setInternal(!!data.internal);
    setContacts(Array.isArray(data.contacts) ? data.contacts : []);
    setVisibleIds(new Set());
    setTimeout(() => setVisibleIds(new Set(adjusted.map(e => e.id))), 50);
    setEntries(adjusted);
  }, [token]);

  useEffect(() => { load(null, ""); }, [load]);
  useEffect(() => { if (selectedDate) load(selectedArena, selectedDate); }, [selectedArena, selectedDate, load]);

  // SSE: sofortige Live-Updates + Fallback-Polling
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    function connect() {
      es = new EventSource("/api/events");
      es.addEventListener("update", () => {
        load(selectedArenaRef.current, selectedDateRef.current || undefined);
      });
      es.onerror = () => { es?.close(); retryTimeout = setTimeout(connect, 3_000); };
    }
    connect();
    const interval = setInterval(() => load(selectedArenaRef.current, selectedDateRef.current || undefined), 30_000);
    const onVisible = () => { if (!document.hidden) load(selectedArenaRef.current, selectedDateRef.current || undefined); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      es?.close(); clearTimeout(retryTimeout); clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  useEffect(() => {
    if (currentRef.current) currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [entries]);

  if (error) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center text-gray-400">
        <Trophy size={48} className="mx-auto mb-4 opacity-20" />
        <p className="text-lg">{error}</p>
      </div>
    </div>
  );

  if (!tournament) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="flex gap-2 items-center text-indigo-400">
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "0ms" }} />
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "150ms" }} />
        <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: "300ms" }} />
      </div>
    </div>
  );

  const currentIdx = entries.findIndex(e => isRunning(e));
  const nextIdx = entries.findIndex(e => !isDone(e) && !isRunning(e));
  const dateIdx = dates.indexOf(selectedDate);

  // Sticky-Offset berechnen
  const hasDates = dates.length > 1;
  const hasArenas = arenas.length > 1;
  const arenaTop = hasDates ? 108 : 64;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* ── Header ── */}
      <header className="bg-gradient-to-r from-indigo-900 via-violet-900 to-indigo-900 border-b border-white/15 sticky top-0 z-30 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.png" alt="EquiPlan" className="w-8 h-8 object-contain opacity-90" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">
              <span data-no-translate><span className="text-white">Equi</span><span className="text-violet-300">Plan</span></span>
              <span className="text-gray-400 font-normal mx-2">·</span>
              <span className="text-white">{tournament.name}</span>
            </h1>
            <div className="flex items-center gap-3 text-xs text-indigo-200 mt-0.5">
              {tournament.location && <span className="flex items-center gap-1"><MapPin size={10} />{tournament.location}</span>}
              {tournament.start_date && (
                <span className="flex items-center gap-1">
                  <Calendar size={10} />
                  {tournament.start_date}{tournament.end_date && tournament.end_date !== tournament.start_date ? ` – ${tournament.end_date}` : ""}
                </span>
              )}
            </div>
          </div>
          {internal && (
            <button onClick={() => setShowInfo(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-white/15 hover:bg-white/25 transition shrink-0 flex items-center gap-1"
              title="Telefonliste">
              📞 Telefonliste
            </button>
          )}
          <button onClick={() => setLang(lang === "de" ? "en" : "de")} data-no-translate
            className="px-2 py-1 rounded-lg text-xs font-bold tracking-wide text-indigo-100 hover:bg-white/10 transition shrink-0"
            title={lang === "de" ? "Switch to English" : "Auf Deutsch umschalten"}>
            {lang === "de" ? "EN" : "DE"}
          </button>
          <LiveClock />
        </div>
      </header>

      {/* ── Datum-Auswahl ── */}
      {hasDates && (
        <div className="bg-gray-900/90 border-b border-white/10 sticky z-20" style={{ top: 64 }}>
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2">
            <button onClick={() => dateIdx > 0 && setSelectedDate(dates[dateIdx - 1])} disabled={dateIdx <= 0}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition">
              <ChevronLeft size={16} />
            </button>
            <div className="flex gap-1.5 overflow-x-auto flex-1 hide-scrollbar">
              {dates.map(d => (
                <button key={d} onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                    d === selectedDate
                      ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/50"
                      : "bg-white/8 text-gray-300 hover:bg-white/15 hover:text-white border border-white/10"
                  }`}>
                  {formatDateShort(d)}
                </button>
              ))}
            </div>
            <button onClick={() => dateIdx < dates.length - 1 && setSelectedDate(dates[dateIdx + 1])} disabled={dateIdx >= dates.length - 1}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 disabled:opacity-30 transition">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Platz-Filter + Ansicht-Toggle ── */}
      {hasArenas && (
        <div className="bg-gray-900/80 border-b border-white/10 sticky z-20" style={{ top: arenaTop }}>
          <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-2 flex-wrap">
            <div className="flex gap-1.5 overflow-x-auto hide-scrollbar flex-1">
              <button onClick={() => setSelectedArena(null)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedArena === null
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50"
                    : "bg-white/8 text-gray-300 hover:bg-white/15 hover:text-white border border-white/10"
                }`}>
                Alle Plätze
              </button>
              {arenas.map(a => (
                <button key={a.id} onClick={() => setSelectedArena(a.id === selectedArena ? null : a.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedArena === a.id
                      ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50"
                      : "bg-white/8 text-gray-300 hover:bg-white/15 hover:text-white border border-white/10"
                  }`}>
                  {a.name}
                </button>
              ))}
            </div>
            {/* Ansicht-Toggle */}
            <div className="flex gap-0.5 p-0.5 bg-white/8 border border-white/10 rounded-lg shrink-0">
              <button onClick={() => setViewMode("list")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${viewMode === "list" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
                ≡ Liste
              </button>
              <button onClick={() => setViewMode("timeline")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${viewMode === "timeline" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}>
                ▦ Zeitleiste
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Inhalt ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 py-4 pb-20">

          {entries.length === 0 && (
            <div className="text-center py-20 text-gray-500">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p>Keine Einträge für diese Auswahl.</p>
            </div>
          )}

          {entries.length > 0 && viewMode === "timeline" && (
            <ShareTimeline entries={entries} selectedDate={selectedDate} />
          )}

          {entries.length > 0 && viewMode === "list" && (
            <div className="space-y-2">
              {entries.map((e, i) => {
                const running = isRunning(e);
                const done = isDone(e);
                const isNext = !running && !done && i === nextIdx;
                const phase = PHASE_LIST[e.phase] ?? PHASE_LIST.pause;
                const isRef = running || (currentIdx === -1 && isNext);

                return (
                  <div
                    key={e.id}
                    ref={isRef ? currentRef : undefined}
                    className={`
                      rounded-xl border p-4 transition-all duration-500
                      ${visibleIds.has(e.id) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
                      ${running
                        ? "border-violet-400 bg-violet-800 shadow-lg shadow-violet-900/50 ring-1 ring-violet-400/60"
                        : done
                          ? "border-white/5 bg-white/3 opacity-35"
                          : `${phase.border} ${phase.bg}`
                      }
                    `}
                    style={{ transitionDelay: `${Math.min(i * 40, 400)}ms` }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Zeit */}
                      <div className="shrink-0 text-right w-16">
                        {e.orig_start && <p className="text-[10px] font-mono text-gray-500 line-through leading-none">{e.orig_start}</p>}
                        <p className={`text-sm font-mono font-bold ${e.orig_start ? "text-red-400" : running ? "text-violet-200" : done ? "text-gray-600" : "text-white"}`}>
                          {e.start_time}
                        </p>
                        <p className={`text-xs font-mono ${done ? "text-gray-700" : "text-gray-400"}`}>{e.end_time}</p>
                      </div>

                      {/* Inhalt */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          {running && (
                            <span className="flex items-center gap-1.5 text-xs font-bold text-white bg-violet-500/40 border border-violet-400/50 px-2 py-0.5 rounded-full animate-pulse">
                              <span className="w-1.5 h-1.5 bg-violet-300 rounded-full animate-ping" />
                              LIVE
                            </span>
                          )}
                          {isNext && !running && (
                            <span className="text-xs font-semibold text-indigo-200 bg-indigo-500/30 border border-indigo-400/40 px-2 py-0.5 rounded-full">
                              Nächstes
                            </span>
                          )}
                          <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${phase.text} bg-black/25 border border-white/10`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${phase.dot}`} />
                            {phase.label}
                          </span>
                        </div>

                        <p className={`font-semibold leading-snug text-base ${done ? "text-gray-600 line-through" : running ? "text-white" : "text-gray-100"}`}>
                          {e.pruefungs_id && <span className="text-gray-500 font-normal text-sm mr-1.5">{e.pruefungs_id}</span>}
                          {e.title}
                        </p>

                        <div className="flex flex-wrap gap-2 mt-1.5">
                          {e.arena_name && (
                            <span className="flex items-center gap-1 text-xs text-gray-300 bg-white/8 border border-white/10 rounded px-2 py-0.5">
                              <MapPin size={9} />{e.arena_name}
                            </span>
                          )}
                          {e.teams?.map(t => (
                            <span key={t.id} className="text-xs text-gray-300 bg-white/8 border border-white/10 rounded px-2 py-0.5">👥 {t.name}</span>
                          ))}
                          {e.speaker_name && (
                            <span className="rounded px-2 py-0.5 text-white text-xs font-medium" style={{ backgroundColor: e.speaker_color || "#4B5563" }}>
                              🎙 {e.speaker_name}
                            </span>
                          )}
                        </div>
                        {e.notes && <p className="text-xs text-gray-400 mt-1.5 italic border-t border-white/8 pt-1.5">{e.notes}</p>}
                        {!done && (e.helpers_needed ?? 0) > 0 && (() => {
                          const signedUp = e.helpers_signed_up ?? 0;
                          const needed = e.helpers_needed ?? 0;
                          const full = signedUp >= needed;
                          return (
                            <div className="mt-2 space-y-1">
                              {e.helpers_task && (
                                <p className="text-xs text-gray-400">Aufgabe: {e.helpers_task}</p>
                              )}
                              <button
                                onClick={() => !full && setHelperEntry(e)}
                                disabled={full}
                                className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition w-fit ${
                                  full
                                    ? "text-green-400 bg-green-500/10 border-green-500/30 cursor-default"
                                    : "text-amber-300 bg-amber-500/15 border-amber-400/30 hover:bg-amber-500/25 cursor-pointer"
                                }`}
                              >
                                {full ? `✓ Alle ${needed} Plätze belegt` : `🙋 ${signedUp}/${needed} Plätze – Jetzt anmelden`}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Scroll-zu-aktuell FAB ── */}
      {viewMode === "list" && (currentIdx >= 0 || nextIdx >= 0) && (
        <button
          onClick={() => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="fixed bottom-6 right-6 bg-violet-600 hover:bg-violet-500 text-white rounded-full px-4 py-2.5 shadow-lg shadow-violet-900/60 text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95 border border-violet-400/40">
          <Clock size={14} />
          {currentIdx >= 0 ? "Aktuell" : "Nächstes"}
        </button>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .bg-white\\/3 { background-color: rgb(255 255 255 / 0.03); }
        .bg-white\\/8 { background-color: rgb(255 255 255 / 0.08); }
      `}</style>

      {helperEntry && <HelperSignupModal entry={helperEntry} token={token} onClose={() => setHelperEntry(null)} onSignedUp={onHelperSignedUp} />}
      {showInfo && <StaffContactsModal contacts={contacts} onClose={() => setShowInfo(false)} />}
    </div>
  );
}

function StaffContactsModal({ contacts, onClose }: { contacts: { id: number; name: string; role?: string; phone?: string }[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-gray-900 border border-white/10 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900 px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-bold text-white text-lg">📞 Telefonliste</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl leading-none">✕</button>
        </div>
        <div className="p-4 space-y-2">
          {contacts.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Keine Kontakte hinterlegt.</p>}
          {contacts.map(c => (
            <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl flex items-center gap-3 p-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-white truncate">{c.name}{c.role && <span className="font-normal text-gray-400"> · {c.role}</span>}</p>
              </div>
              {c.phone && (
                <a href={`tel:${c.phone.replace(/\s/g, "")}`}
                  className="shrink-0 text-sm font-medium text-indigo-200 bg-indigo-500/20 border border-indigo-400/30 rounded-lg px-3 py-1.5 hover:bg-indigo-500/30 transition whitespace-nowrap">
                  📲 {c.phone}
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function HelperSignupModal({ entry, token, onClose, onSignedUp }: { entry: Entry; token: string; onClose: () => void; onSignedUp: (entryId: number) => void }) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const r = await fetch("/api/helpers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry_id: entry.id, share_token: token, name, contact, note }),
    });
    if (r.ok) { setDone(true); onSignedUp(entry.id); }
    else { const d = await r.json(); setError(d.error || "Anmeldung fehlgeschlagen"); }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-gray-900 border border-white/10 w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl p-5">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white text-xl">✕</button>
        {done ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-5xl">🙌</div>
            <p className="text-white font-bold text-lg">Danke, {name}!</p>
            <p className="text-gray-400 text-sm">Du bist als Helfer eingetragen für:<br /><span className="text-white">{entry.title}</span></p>
            <button onClick={onClose} className="mt-3 bg-violet-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-violet-500">Schließen</button>
          </div>
        ) : (
          <>
            <h2 className="text-white font-bold text-lg mb-1">Als Helfer anmelden</h2>
            <p className="text-gray-400 text-sm">{entry.title} · {entry.start_time}–{entry.end_time}</p>
            {entry.helpers_task && <p className="text-amber-300 text-sm mt-1 mb-4">Aufgabe: {entry.helpers_task}</p>}
            {!entry.helpers_task && <div className="mb-4" />}
            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Name *</label>
                <input required value={name} onChange={e => setName(e.target.value)} placeholder="Dein Name"
                  className="w-full bg-gray-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-600" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">E-Mail oder Telefon *</label>
                <input required value={contact} onChange={e => setContact(e.target.value)} placeholder="Für Rückfragen"
                  className="w-full bg-gray-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-600" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Anmerkung (optional)</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="z.B. Erfahrungen, Einschränkungen..."
                  className="w-full bg-gray-800 border border-white/10 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 placeholder-gray-600 resize-none" />
              </div>
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white font-medium py-2.5 rounded-lg text-sm transition disabled:opacity-50">
                {loading ? "Anmelden…" : "Jetzt anmelden"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }));
    update();
    const t = setInterval(update, 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="text-sm font-mono font-semibold text-white bg-white/10 border border-white/15 px-2.5 py-1 rounded-lg tabular-nums">{time}</span>;
}
