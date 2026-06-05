"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { use } from "react";
import { Trophy, MapPin, Clock, ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface Arena { id: number; name: string; }
interface Team { id: number; name: string; }
interface Entry {
  id: number; date: string; start_time: string; end_time: string;
  title: string; phase: string; pruefungs_id?: string; notes?: string;
  arena_name?: string; speaker_name?: string; speaker_role?: string; speaker_color?: string;
  teams: Team[];
}
interface Tournament { id: number; name: string; location?: string; start_date?: string; end_date?: string; }

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  aufbau:    { bg: "bg-orange-900/40",  border: "border-orange-500/50",  text: "text-orange-300",  dot: "bg-orange-400" },
  wettkampf: { bg: "bg-blue-900/40",    border: "border-blue-500/50",    text: "text-blue-300",    dot: "bg-blue-400" },
  abbau:     { bg: "bg-purple-900/40",  border: "border-purple-500/50",  text: "text-purple-300",  dot: "bg-purple-400" },
  pause:     { bg: "bg-gray-800/40",    border: "border-gray-600/50",    text: "text-gray-400",    dot: "bg-gray-500" },
};
const PHASE_LABELS: Record<string, string> = { aufbau: "Aufbau", wettkampf: "Wettkampf", abbau: "Abbau", pause: "Pause" };

function now() { return new Date(); }
function isRunning(e: Entry) {
  const n = now();
  return new Date(`${e.date}T${e.start_time}`) <= n && new Date(`${e.date}T${e.end_time}`) > n;
}
function isDone(e: Entry) { return new Date(`${e.date}T${e.end_time}`) < now(); }
function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "short" });
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [selectedArena, setSelectedArena] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [visibleIds, setVisibleIds] = useState<Set<number>>(new Set());
  const listRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLDivElement>(null);

  // Clock tick every 30s to update running/done state
  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async (arenaId?: number | null, date?: string) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (arenaId) params.set("arena_id", String(arenaId));
    const res = await fetch(`/api/public/${token}?${params}`);
    if (!res.ok) { setError("Link ungültig oder abgelaufen."); return; }
    const data = await res.json();
    setTournament(data.tournament);
    setArenas(data.arenas);
    setDates(data.dates);
    if (!date && data.dates.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      setSelectedDate(data.dates.includes(today) ? today : data.dates[0]);
    }
    // Animate entries in
    const newIds = new Set<number>();
    setVisibleIds(newIds);
    setTimeout(() => {
      const allIds = new Set((data.entries as Entry[]).map(e => e.id));
      setVisibleIds(allIds);
    }, 50);
    setEntries(data.entries);
  }, [token]);

  useEffect(() => { load(null, ""); }, [load]);
  useEffect(() => { if (selectedDate) load(selectedArena, selectedDate); }, [selectedArena, selectedDate, load]);

  // Auto-scroll to current/next event
  useEffect(() => {
    if (currentRef.current) {
      currentRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-900 via-violet-900 to-indigo-900 border-b border-white/10 sticky top-0 z-20 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src="/logo.png" alt="EquiPlan" className="w-8 h-8 object-contain opacity-90" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base leading-tight truncate">
              <span className="text-white">Equi</span><span className="text-violet-400">Plan</span>
              <span className="text-gray-400 font-normal mx-2">·</span>
              <span className="text-white">{tournament.name}</span>
            </h1>
            <div className="flex items-center gap-3 text-xs text-indigo-300 mt-0.5">
              {tournament.location && <span className="flex items-center gap-1"><MapPin size={10} />{tournament.location}</span>}
              {tournament.start_date && <span className="flex items-center gap-1"><Calendar size={10} />{tournament.start_date}{tournament.end_date && tournament.end_date !== tournament.start_date ? ` – ${tournament.end_date}` : ""}</span>}
            </div>
          </div>
          <LiveClock />
        </div>
      </header>

      {/* Date selector */}
      {dates.length > 1 && (
        <div className="bg-gray-900/80 border-b border-white/5 sticky top-[64px] z-10">
          <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-2">
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
                      : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                  }`}>
                  {formatDate(d)}
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

      {/* Arena selector */}
      {arenas.length > 1 && (
        <div className="bg-gray-900/60 border-b border-white/5 sticky top-[64px] z-10" style={{ top: dates.length > 1 ? "112px" : "64px" }}>
          <div className="max-w-3xl mx-auto px-4 py-2 flex gap-2 overflow-x-auto hide-scrollbar">
            <button onClick={() => setSelectedArena(null)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                selectedArena === null
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50 scale-105"
                  : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
              }`}>
              Alle Plätze
            </button>
            {arenas.map(a => (
              <button key={a.id} onClick={() => setSelectedArena(a.id === selectedArena ? null : a.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  selectedArena === a.id
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-900/50 scale-105"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}>
                {a.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto" ref={listRef}>
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-2 pb-16">
          {entries.length === 0 && (
            <div className="text-center py-20 text-gray-600">
              <Clock size={40} className="mx-auto mb-3 opacity-30" />
              <p>Keine Einträge für diese Auswahl.</p>
            </div>
          )}
          {entries.map((e, i) => {
            const running = isRunning(e);
            const done = isDone(e);
            const isNext = !running && !done && i === nextIdx;
            const phase = PHASE_COLORS[e.phase] ?? PHASE_COLORS.pause;
            const isRef = running || (currentIdx === -1 && isNext);

            return (
              <div
                key={e.id}
                ref={isRef ? currentRef : undefined}
                className={`
                  rounded-xl border p-3.5 transition-all duration-500
                  ${visibleIds.has(e.id) ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}
                  ${running
                    ? "border-violet-500/70 bg-violet-900/30 shadow-lg shadow-violet-900/30 ring-1 ring-violet-500/30"
                    : done
                      ? "border-white/5 bg-white/3 opacity-40"
                      : isNext
                        ? `${phase.border} ${phase.bg} shadow-md`
                        : `${phase.border} ${phase.bg}`
                  }
                `}
                style={{ transitionDelay: `${Math.min(i * 40, 400)}ms` }}
              >
                <div className="flex items-start gap-3">
                  {/* Time column */}
                  <div className="shrink-0 text-right w-16">
                    <p className={`text-sm font-mono font-bold ${running ? "text-violet-300" : done ? "text-gray-600" : "text-gray-300"}`}>
                      {e.start_time}
                    </p>
                    <p className={`text-xs font-mono ${done ? "text-gray-700" : "text-gray-500"}`}>{e.end_time}</p>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {running && (
                        <span className="flex items-center gap-1 text-xs font-bold text-violet-300 bg-violet-500/20 px-2 py-0.5 rounded-full animate-pulse">
                          <span className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-ping" />
                          LIVE
                        </span>
                      )}
                      {isNext && !running && (
                        <span className="text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full">
                          Nächstes
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${phase.text} bg-black/20`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${phase.dot}`} />
                        {PHASE_LABELS[e.phase] ?? e.phase}
                      </span>
                    </div>

                    <p className={`font-semibold mt-1 leading-snug ${done ? "text-gray-600 line-through" : running ? "text-white" : "text-gray-100"}`}>
                      {e.pruefungs_id && <span className="text-gray-500 font-normal text-sm mr-1.5">{e.pruefungs_id}</span>}
                      {e.title}
                    </p>

                    <div className="flex flex-wrap gap-2 mt-1.5 text-xs">
                      {e.arena_name && (
                        <span className="flex items-center gap-1 text-gray-400">
                          <MapPin size={10} />{e.arena_name}
                        </span>
                      )}
                      {e.teams?.map(t => (
                        <span key={t.id} className="text-gray-400">👥 {t.name}</span>
                      ))}
                      {e.speaker_name && (
                        <span className="rounded px-1.5 py-0.5 text-white text-xs" style={{ backgroundColor: e.speaker_color || "#4B5563" }}>
                          🎙 {e.speaker_name}
                        </span>
                      )}
                    </div>
                    {e.notes && <p className="text-xs text-gray-500 mt-1 italic">{e.notes}</p>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scroll-to-current FAB */}
      {(currentIdx >= 0 || nextIdx >= 0) && (
        <button
          onClick={() => currentRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}
          className="fixed bottom-6 right-6 bg-violet-600 hover:bg-violet-500 text-white rounded-full px-4 py-2.5 shadow-lg shadow-violet-900/50 text-sm font-medium flex items-center gap-2 transition-all hover:scale-105 active:scale-95">
          <Clock size={14} />
          {currentIdx >= 0 ? "Aktuell" : "Nächstes"}
        </button>
      )}

      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .bg-white\\/3 { background-color: rgb(255 255 255 / 0.03); }
      `}</style>
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
  return <span className="text-xs font-mono text-indigo-300 bg-white/5 px-2 py-1 rounded-lg tabular-nums">{time}</span>;
}
