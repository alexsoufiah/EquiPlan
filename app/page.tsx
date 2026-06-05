"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { LogOut, Settings, Bell, BellOff, RefreshCw, ChevronLeft, ChevronRight, Trophy, ChevronDown, Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

// Types
interface Speaker { id: number; name: string; role: string; color: string; has_password?: number; }
interface Arena { id: number; name: string; description?: string; }
interface Team { id: number; name: string; description?: string; has_password?: number; }
interface Tournament { id: number; name: string; location?: string; start_date?: string; end_date?: string; }
interface ScheduleEntry {
  id: number; date: string; start_time: string; end_time: string;
  title: string; phase: string; pruefungs_id?: string; tournament_id?: number; arena_id?: number; speaker_id?: number;
  notes?: string; arena_name?: string; external_source?: string;
  speaker_name?: string; speaker_role?: string; speaker_color?: string;
  teams: { id: number; name: string }[];
}

const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  aufbau:    { label: "Aufbau",    color: "text-orange-700", bg: "bg-orange-50",  border: "border-orange-300" },
  wettkampf: { label: "Wettkampf", color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-300" },
  abbau:     { label: "Abbau",     color: "text-purple-700", bg: "bg-purple-50",  border: "border-purple-300" },
  pause:     { label: "Pause",     color: "text-gray-600",   bg: "bg-gray-50",    border: "border-gray-300" },
};

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function addDays(date: string, n: number) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function today() { return new Date().toISOString().slice(0, 10); }

async function registerPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const res = await fetch("/api/push");
  if (!res.ok) return null;
  const { publicKey } = await res.json();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: publicKey,
  });
  await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sub) });
  return sub;
}

function LoginForm({ onLogin }: { onLogin: (s: AppSession) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    if (res.ok) {
      const data = await res.json();
      onLogin({ role: data.role, teamId: data.teamId, teamName: data.teamName, speakerId: data.speakerId, speakerName: data.speakerName, speakerRole: data.speakerRole, speakerColor: data.speakerColor });
    } else {
      setError("Falsches Passwort");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-900 to-violet-700">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <img src="/logo.png" alt="EquiPlan" className="w-24 h-24 mx-auto mb-2 object-contain" />
          <h1 className="text-2xl font-bold text-gray-800">
            <span className="text-indigo-900">Equi</span><span className="text-violet-600">Plan</span>
          </h1>
          <p className="text-gray-500 text-sm mt-1">Veranstaltungsplanung</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Zugangspasswort eingeben" autoFocus
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50">
            {loading ? "..." : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}

function isEntryDone(entry: ScheduleEntry): boolean {
  const now = new Date();
  const end = new Date(`${entry.date}T${entry.end_time}:00`);
  return end < now;
}

function EntryCard({ entry, myTeamId }: { entry: ScheduleEntry; myTeamId?: number }) {
  const done = isEntryDone(entry);
  const isMyTeam = myTeamId != null && entry.teams?.some(t => t.id === myTeamId);
  const phase = PHASE_CONFIG[entry.phase] ?? PHASE_CONFIG.pause;

  if (done) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-50 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-semibold text-gray-400 line-through">
              {entry.pruefungs_id && <span className="font-normal mr-1">{entry.pruefungs_id}</span>}
              {entry.title}
            </span>
            <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium text-gray-400 bg-white border border-gray-200">
              {phase.label} · Abgeschlossen
            </span>
          </div>
          <span className="text-sm font-mono text-gray-400 whitespace-nowrap">{entry.start_time}–{entry.end_time}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-gray-400">
          {entry.arena_name && <span className="bg-white border border-gray-200 rounded px-2 py-0.5">📍 {entry.arena_name}</span>}
          {entry.teams?.map(t => <span key={t.id} className="bg-white border border-gray-200 rounded px-2 py-0.5">👥 {t.name}</span>)}
        </div>
      </div>
    );
  }

  if (isMyTeam) {
    return (
      <div className={`rounded-xl border-l-4 border-violet-500 bg-violet-50 p-3 space-y-1 ring-2 ring-violet-300 shadow-md`}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="font-bold text-violet-900">
              {entry.pruefungs_id && <span className="text-violet-400 font-normal mr-1">{entry.pruefungs_id}</span>}
              {entry.title}
            </span>
            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white border ${phase.border}`}>{phase.label}</span>
            <span className="ml-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-violet-600 text-white">Ihr Einsatz</span>
          </div>
          <span className="text-sm font-mono font-bold text-violet-700 whitespace-nowrap">{entry.start_time}–{entry.end_time}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {entry.arena_name && <span className="bg-white border border-violet-200 rounded px-2 py-0.5 text-violet-700">📍 {entry.arena_name}</span>}
          {entry.teams?.map(t => (
            <span key={t.id} className={`rounded px-2 py-0.5 border ${t.id === myTeamId ? "bg-violet-600 text-white border-violet-600 font-semibold" : "bg-white border-gray-200 text-gray-600"}`}>
              👥 {t.name}
            </span>
          ))}
          {entry.speaker_name && (
            <span className="rounded px-2 py-0.5 text-white text-xs" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
              🎙 {entry.speaker_name} ({entry.speaker_role})
            </span>
          )}
        </div>
        {entry.notes && <p className="text-xs text-violet-700 mt-1 italic">{entry.notes}</p>}
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-l-4 ${phase.border} ${phase.bg} p-3 space-y-1`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-semibold text-gray-800">
            {entry.pruefungs_id && <span className="text-gray-400 font-normal mr-1">{entry.pruefungs_id}</span>}
            {entry.title}
          </span>
          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white border ${phase.border}`}>{phase.label}</span>
        </div>
        <span className="text-sm font-mono text-gray-500 whitespace-nowrap">{entry.start_time}–{entry.end_time}</span>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-gray-600">
        {entry.arena_name && <span className="bg-white border border-gray-200 rounded px-2 py-0.5">📍 {entry.arena_name}</span>}
        {entry.teams?.map(t => <span key={t.id} className="bg-white border border-gray-200 rounded px-2 py-0.5">👥 {t.name}</span>)}
        {entry.speaker_name && (
          <span className="rounded px-2 py-0.5 text-white text-xs" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
            🎙 {entry.speaker_name} ({entry.speaker_role})
          </span>
        )}
      </div>
      {entry.external_source && <span className="text-xs bg-gray-100 border border-gray-200 rounded px-2 py-0.5 text-gray-400">via {entry.external_source}</span>}
      {entry.notes && <p className="text-xs text-gray-500 mt-1 italic">{entry.notes}</p>}
    </div>
  );
}

interface AppSession { role: string; teamId?: number; teamName?: string; speakerId?: number; speakerName?: string; speakerRole?: string; speakerColor?: string; }
type AppView = "tournament-select" | "schedule" | "admin";

export default function App() {
  const { theme, toggle: toggleTheme } = useTheme();
  const [session, setSession] = useState<AppSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<AppView>("tournament-select");
  const activeTournamentRef = useRef<Tournament | null>(null);

  useEffect(() => {
    fetch("/api/schedule").then(async r => {
      if (r.ok) {
        const adminCheck = await fetch("/api/arenas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: -1 }) });
        setSession({ role: adminCheck.status === 403 ? "viewer" : "admin" });
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const loadTournaments = useCallback(async () => {
    const res = await fetch("/api/tournaments");
    if (res.ok) setTournaments(await res.json());
  }, []);

  const loadEntries = useCallback(async (tournamentId: number, date: string) => {
    setLoading(true);
    const res = await fetch(`/api/schedule?tournament_id=${tournamentId}&date=${date}`);
    if (res.ok) setEntries(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { if (session) loadTournaments(); }, [session, loadTournaments]);

  // Turnier gewechselt → Ref updaten, Schedule-View öffnen, Laden
  useEffect(() => {
    if (activeTournament) {
      activeTournamentRef.current = activeTournament;
      setView("schedule");
      loadEntries(activeTournament.id, selectedDate);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTournament]);

  // Datum gewechselt → Ref nutzen (kein staler Wert)
  useEffect(() => {
    if (activeTournamentRef.current) {
      loadEntries(activeTournamentRef.current.id, selectedDate);
    }
  }, [selectedDate, loadEntries]);

  async function handleLogin(s: AppSession) { setSession(s); }
  async function handleLogout() {
    await fetch("/api/auth", { method: "DELETE" });
    setSession(null); setActiveTournament(null); setTournaments([]); setView("tournament-select");
  }
  async function togglePush() {
    if (pushEnabled) { setPushEnabled(false); return; }
    try { await registerPush(); setPushEnabled(true); }
    catch { alert("Push-Benachrichtigungen konnten nicht aktiviert werden."); }
  }

  if (checking) return <div className="min-h-screen flex items-center justify-center"><div className="text-gray-400 text-lg">Laden...</div></div>;
  if (!session) return <LoginForm onLogin={handleLogin} />;

  if (view === "tournament-select" || !activeTournament) {
    return <TournamentSelect tournaments={tournaments} session={session} onSelect={t => setActiveTournament(t)} onLogout={handleLogout} onCreated={loadTournaments} />;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <header className="bg-gradient-to-r from-indigo-800 to-violet-700 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="EquiPlan" className="w-9 h-9 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-lg leading-tight tracking-tight">
                <span className="text-white">Equi</span><span className="text-violet-300">Plan</span>
              </h1>
              <button onClick={() => setView("tournament-select")} className="flex items-center gap-1 text-indigo-200 hover:text-white text-xs transition truncate max-w-[200px]">
                <Trophy size={11} className="shrink-0" />
                <span className="truncate">{activeTournament.name}</span>
                <ChevronDown size={11} className="shrink-0" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {session?.role === "team" && <span className="text-xs bg-white/10 text-indigo-100 px-2 py-0.5 rounded-full mr-1 hidden sm:block">👥 {session.teamName}</span>}
            {session?.role === "speaker" && (
              <span className="text-xs px-2 py-0.5 rounded-full mr-1 hidden sm:block font-medium text-white" style={{ backgroundColor: session.speakerColor || "#6366f1" }}>
                🎙 {session.speakerName} · {session.speakerRole}
              </span>
            )}
            <button onClick={togglePush} className="p-2 rounded-lg hover:bg-indigo-700 transition">
              {pushEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
            <button onClick={() => activeTournament && loadEntries(activeTournament.id, selectedDate)} className="p-2 rounded-lg hover:bg-indigo-700 transition">
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            {session?.role === "admin" && (
              <button onClick={() => setView(v => v === "admin" ? "schedule" : "admin")}
                className={`p-2 rounded-lg transition ${view === "admin" ? "bg-indigo-500" : "hover:bg-indigo-700"}`}>
                <Settings size={18} />
              </button>
            )}
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-indigo-700 transition" title={theme === "dark" ? "Hellmodus" : "Dunkelmodus"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-indigo-700 transition"><LogOut size={18} /></button>
          </div>
        </div>
        <div className="bg-black/20 px-4 py-1.5 flex items-center gap-3 text-xs text-indigo-100">
          <Trophy size={12} className="shrink-0" />
          <span className="font-semibold">{activeTournament.name}</span>
          {activeTournament.location && <span className="text-indigo-300">📍 {activeTournament.location}</span>}
          {activeTournament.start_date && (
            <span className="text-indigo-300">
              {activeTournament.start_date}{activeTournament.end_date && activeTournament.end_date !== activeTournament.start_date ? ` – ${activeTournament.end_date}` : ""}
            </span>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        {view === "schedule" && <ScheduleTab entries={entries} selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} onRefresh={() => loadEntries(activeTournament.id, selectedDate)} />}
        {view === "admin" && <AdminTab onRefresh={() => loadEntries(activeTournament.id, selectedDate)} activeTournamentId={activeTournament.id} />}
      </main>
    </div>
  );
}

function TournamentSelect({ tournaments, session, onSelect, onLogout, onCreated }: {
  tournaments: Tournament[]; session: AppSession;
  onSelect: (t: Tournament) => void; onLogout: () => void; onCreated: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", start_date: "", end_date: "" });
  const [saving, setSaving] = useState(false);

  async function create() {
    if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tournaments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (res.ok) { const t = await res.json(); onCreated(); onSelect(t); }
    setSaving(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 to-violet-800 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="EquiPlan" className="w-20 h-20 mx-auto mb-3 object-contain" />
          <h1 className="text-3xl font-bold text-white"><span>Equi</span><span className="text-violet-300">Plan</span></h1>
          <p className="text-indigo-200 text-sm mt-1">
            {session.role === "team" ? `Eingeloggt als: ${session.teamName}` : session.role === "admin" ? "Administrator" : "Viewer"}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden">
          <div className="bg-indigo-50 dark:bg-indigo-900/30 border-b border-indigo-100 dark:border-indigo-800 px-5 py-3 flex items-center justify-between">
            <h2 className="font-semibold text-indigo-900 dark:text-indigo-200 flex items-center gap-2"><Trophy size={16} /> Turnier auswählen</h2>
            <button onClick={onLogout} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><LogOut size={12} /> Abmelden</button>
          </div>
          {tournaments.length === 0 ? (
            <div className="px-5 py-10 text-center text-gray-400">
              <Trophy size={36} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">Noch keine Turniere vorhanden.</p>
              {session.role === "admin" && <p className="text-xs mt-1">Erstelle das erste Turnier unten.</p>}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {tournaments.map(t => (
                <button key={t.id} onClick={() => onSelect(t)}
                  className="w-full px-5 py-4 text-left hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center gap-4 group">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <Trophy size={18} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 dark:text-gray-100 truncate">{t.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {[t.location, t.start_date && `${t.start_date}${t.end_date && t.end_date !== t.start_date ? ` – ${t.end_date}` : ""}`].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <ChevronDown size={16} className="text-gray-300 -rotate-90 shrink-0" />
                </button>
              ))}
            </div>
          )}
          {session.role === "admin" && (
            <div className="border-t border-gray-100 dark:border-gray-700 p-4">
              {!showNew ? (
                <button onClick={() => setShowNew(true)} className="w-full py-2.5 rounded-lg border-2 border-dashed border-indigo-200 text-indigo-500 text-sm hover:border-indigo-400 hover:text-indigo-700 transition font-medium">
                  + Neues Turnier erstellen
                </button>
              ) : (
                <div className="space-y-2">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inputClass} placeholder="Turniername *" autoFocus />
                  <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className={inputClass} placeholder="Ort (optional)" />
                  <div className="grid grid-cols-2 gap-2">
                    <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className={inputClass} />
                    <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className={inputClass} />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={create} disabled={saving || !form.name.trim()} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
                      {saving ? "..." : "Erstellen & öffnen"}
                    </button>
                    <button onClick={() => setShowNew(false)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">✕</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ScheduleTab({ entries, selectedDate, setSelectedDate, session, onRefresh }: {
  entries: ScheduleEntry[]; selectedDate: string; setSelectedDate: (d: string) => void; session: AppSession | null; onRefresh: () => void;
}) {
  void onRefresh;
  const myTeamId = session?.teamId;
  return (
    <div>
      <div className="flex items-center justify-between mb-6 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm gap-2">
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, -1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="text-center flex-1">
          <p className="font-semibold text-gray-800 dark:text-gray-100 text-sm sm:text-base">{formatDate(selectedDate)}</p>
          <div className="flex items-center justify-center gap-3 mt-0.5">
            <button onClick={() => setSelectedDate(today())} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">Heute</button>
            <input
              type="date"
              value={selectedDate}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
              className="text-xs text-gray-400 dark:text-gray-500 bg-transparent cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 border-none outline-none"
            />
          </div>
        </div>
        <button
          onClick={() => setSelectedDate(addDays(selectedDate, 1))}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 transition"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p>Keine Einträge für diesen Tag.</p>
          {session?.role === "admin" && <p className="text-sm mt-1">Im ⚙️ Admin-Bereich Einträge anlegen.</p>}
          {session?.role === "team" && <p className="text-sm mt-1 text-violet-600">Heute keine Einsätze für {session.teamName}.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(e => <EntryCard key={e.id} entry={e} myTeamId={myTeamId} />)}
        </div>
      )}
    </div>
  );
}

function AdminTab({ onRefresh, activeTournamentId }: { onRefresh: () => void; activeTournamentId?: number }) {
  const [tab, setTab] = useState<"entries" | "speakers" | "arenas" | "teams" | "settings" | "api" | "share">("entries");
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editEntry, setEditEntry] = useState<Partial<ScheduleEntry> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());

  const load = useCallback(async () => {
    const [e, s, a, t] = await Promise.all([
      fetch(`/api/schedule?date=${selectedDate}`).then(r => r.json()),
      fetch("/api/speakers").then(r => r.json()),
      fetch("/api/arenas").then(r => r.json()),
      fetch("/api/teams").then(r => r.json()),
    ]);
    setEntries(Array.isArray(e) ? e : []);
    setSpeakers(Array.isArray(s) ? s : []);
    setArenas(Array.isArray(a) ? a : []);
    setTeams(Array.isArray(t) ? t : []);
  }, [selectedDate]);

  useEffect(() => { load(); }, [load]);

  async function saveEntry(data: Partial<ScheduleEntry> & { team_ids?: number[] }) {
    const method = data.id ? "PUT" : "POST";
    const url = data.id ? `/api/schedule/${data.id}` : "/api/schedule";
    await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    setShowForm(false); setEditEntry(null);
    load(); onRefresh();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    load(); onRefresh();
  }

  const tabs = [
    { key: "entries", label: "Einträge" },
    { key: "speakers", label: "Sprecher" },
    { key: "arenas", label: "Plätze" },
    { key: "teams", label: "Teams" },
    { key: "settings", label: "Passwörter" },
    { key: "api", label: "API-Zugang" },
    { key: "share", label: "Share-Link" },
  ] as const;

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4"><span className="text-indigo-900">Equi</span><span className="text-violet-600">Plan</span> – Admin</h2>
      <div className="flex gap-2 mb-5 flex-wrap">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${tab === t.key ? "bg-indigo-600 text-white" : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "entries" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            <button onClick={() => { setEditEntry({ date: selectedDate, phase: "wettkampf", tournament_id: activeTournamentId }); setShowForm(true); }}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">
              + Neuer Eintrag
            </button>
          </div>
          {entries.map(e => (
            <div key={e.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-start gap-3">
              <div className="flex-1"><EntryCard entry={e} /></div>
              <div className="flex flex-col gap-1 shrink-0">
                <button onClick={() => { setEditEntry(e); setShowForm(true); }}
                  className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100">Bearbeiten</button>
                <button onClick={() => deleteEntry(e.id)}
                  className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1 rounded hover:bg-red-100">Löschen</button>
              </div>
            </div>
          ))}
          {entries.length === 0 && <p className="text-gray-400 dark:text-gray-500 text-center py-8">Keine Einträge für diesen Tag.</p>}
        </div>
      )}
      {tab === "speakers" && <SpeakersTab speakers={speakers} onRefresh={load} />}
      {tab === "arenas" && <ArenasTab arenas={arenas} onRefresh={load} />}
      {tab === "teams" && <TeamsTab teams={teams} onRefresh={load} />}
      {tab === "settings" && <PasswordSettings />}
      {tab === "api" && <ApiKeySettings />}
      {tab === "share" && <ShareTab tournamentId={activeTournamentId} />}

      {showForm && (
        <EntryForm
          entry={editEntry} speakers={speakers} arenas={arenas} teams={teams}
          onSave={saveEntry} onClose={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}
    </div>
  );
}

const inputClass = "w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 dark:placeholder:text-gray-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>{children}</div>;
}

function EntryForm({ entry, speakers, arenas, teams, onSave, onClose }: {
  entry: Partial<ScheduleEntry> | null; speakers: Speaker[]; arenas: Arena[]; teams: Team[];
  onSave: (d: Partial<ScheduleEntry> & { team_ids: number[] }) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<ScheduleEntry>>(entry ?? { phase: "wettkampf", date: today(), teams: [] });
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>(entry?.teams?.map(t => t.id) ?? []);
  const set = (k: keyof ScheduleEntry, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  function toggleTeam(id: number) {
    setSelectedTeamIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-5 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 dark:text-gray-100">{form.id ? "Eintrag bearbeiten" : "Neuer Eintrag"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none">✕</button>
        </div>
        <div className="p-5 space-y-3">
          <Field label="Datum"><input type="date" value={form.date ?? ""} onChange={e => set("date", e.target.value)} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Von"><input type="time" value={form.start_time ?? ""} onChange={e => set("start_time", e.target.value)} className={inputClass} /></Field>
            <Field label="Bis"><input type="time" value={form.end_time ?? ""} onChange={e => set("end_time", e.target.value)} className={inputClass} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Titel"><input type="text" value={form.title ?? ""} onChange={e => set("title", e.target.value)} className={inputClass} placeholder="z.B. Dressur Klasse A" /></Field>
            <Field label="Prüfungs-ID (optional)"><input type="text" value={form.pruefungs_id ?? ""} onChange={e => set("pruefungs_id", e.target.value || undefined)} className={inputClass} placeholder="z.B. P-2026-001" /></Field>
          </div>
          <Field label="Phase">
            <select value={form.phase ?? "wettkampf"} onChange={e => set("phase", e.target.value)} className={inputClass}>
              {Object.entries(PHASE_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </Field>
          <Field label="Platz">
            <select value={form.arena_id ?? ""} onChange={e => set("arena_id", e.target.value ? Number(e.target.value) : undefined)} className={inputClass}>
              <option value="">– kein Platz –</option>
              {arenas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Einsatzgruppen (Mehrfachauswahl)">
            <div className="flex flex-wrap gap-2 mt-1">
              {teams.map(t => {
                const active = selectedTeamIds.includes(t.id);
                return (
                  <button key={t.id} type="button" onClick={() => toggleTeam(t.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition ${active ? "bg-indigo-600 text-white border-indigo-600" : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:border-indigo-400"}`}>
                    {active ? "✓ " : ""}{t.name}
                  </button>
                );
              })}
            </div>
          </Field>
          <Field label="Sprecher">
            <select value={form.speaker_id ?? ""} onChange={e => set("speaker_id", e.target.value ? Number(e.target.value) : undefined)} className={inputClass}>
              <option value="">– kein Sprecher –</option>
              {speakers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.role})</option>)}
            </select>
          </Field>
          <Field label="Notizen">
            <textarea value={form.notes ?? ""} onChange={e => set("notes", e.target.value)} className={inputClass} rows={2} placeholder="Optionale Hinweise..." />
          </Field>
        </div>
        <div className="p-5 border-t border-gray-100 dark:border-gray-700 flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-gray-300 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          <button onClick={() => onSave({ ...form, team_ids: selectedTeamIds })} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">Speichern</button>
        </div>
      </div>
    </div>
  );
}

function SpeakersTab({ speakers, onRefresh }: { speakers: Speaker[]; onRefresh: () => void }) {
  const [edit, setEdit] = useState<Partial<Speaker> | null>(null);
  const [newPassword, setNewPassword] = useState("");

  async function save() {
    if (!edit) return;
    const payload = { ...edit, password: newPassword || undefined };
    const method = edit.id ? "PUT" : "POST";
    await fetch("/api/speakers", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setEdit(null); setNewPassword(""); onRefresh();
  }

  async function removePassword(id: number) {
    if (!confirm("Passwort wirklich entfernen?")) return;
    const s = speakers.find(x => x.id === id)!;
    await fetch("/api/speakers", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...s, password: null }) });
    onRefresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Sprecher ({speakers.length}/3)</h3>
        {speakers.length < 3 && (
          <button onClick={() => { setEdit({ color: "#3B82F6" }); setNewPassword(""); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ Hinzufügen</button>
        )}
      </div>
      {speakers.map(s => (
        <div key={s.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: s.color }} />
          <div className="flex-1">
            <p className="font-medium text-gray-800 dark:text-gray-100">{s.name}</p>
            <p className="text-xs text-gray-500">{s.role}</p>
          </div>
          <div className="flex items-center gap-2">
            {s.has_password
              ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">🔒 Login aktiv</span>
              : <span className="text-xs bg-gray-50 text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">Kein Login</span>
            }
            <button onClick={() => { setEdit({ ...s }); setNewPassword(""); }} className="text-xs text-blue-600 hover:underline">Bearbeiten</button>
          </div>
        </div>
      ))}
      {edit !== null && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <Field label="Name"><input value={edit.name ?? ""} onChange={e => setEdit(v => ({ ...v!, name: e.target.value }))} className={inputClass} /></Field>
          <Field label="Rolle (z.B. Hauptsprecher)"><input value={edit.role ?? ""} onChange={e => setEdit(v => ({ ...v!, role: e.target.value }))} className={inputClass} /></Field>
          <Field label="Farbe"><input type="color" value={edit.color ?? "#3B82F6"} onChange={e => setEdit(v => ({ ...v!, color: e.target.value }))} className="h-10 w-full rounded border border-gray-300 cursor-pointer" /></Field>
          <Field label={edit.has_password ? "Neues Passwort (leer = nicht ändern)" : "Passwort setzen"}>
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className={inputClass} placeholder={edit.has_password ? "Leer lassen = unverändert" : "Passwort für Login eingeben"} />
          </Field>
          {edit.id && edit.has_password && (
            <button onClick={() => removePassword(edit.id!)} className="text-xs text-red-500 hover:underline">Passwort entfernen (Login deaktivieren)</button>
          )}
          <div className="flex gap-2">
            <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Speichern</button>
            <button onClick={() => { setEdit(null); setNewPassword(""); }} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ArenasTab({ arenas, onRefresh }: { arenas: Arena[]; onRefresh: () => void }) {
  const [edit, setEdit] = useState<Partial<Arena> | null>(null);

  async function save() {
    if (!edit) return;
    const method = edit.id ? "PUT" : "POST";
    await fetch("/api/arenas", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    setEdit(null); onRefresh();
  }

  async function del(id: number) {
    if (!confirm("Platz löschen?")) return;
    await fetch("/api/arenas", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    onRefresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Veranstaltungsplätze</h3>
        <button onClick={() => setEdit({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ Hinzufügen</button>
      </div>
      {arenas.map(a => (
        <div key={a.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="font-medium text-gray-800 dark:text-gray-100">📍 {a.name}</p>
            {a.description && <p className="text-xs text-gray-500">{a.description}</p>}
          </div>
          <button onClick={() => setEdit({ ...a })} className="text-xs text-blue-600 hover:underline mr-2">Bearbeiten</button>
          <button onClick={() => del(a.id)} className="text-xs text-red-500 hover:underline">Löschen</button>
        </div>
      ))}
      {edit !== null && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <Field label="Name"><input value={edit.name ?? ""} onChange={e => setEdit(v => ({ ...v!, name: e.target.value }))} className={inputClass} /></Field>
          <Field label="Beschreibung (optional)"><input value={edit.description ?? ""} onChange={e => setEdit(v => ({ ...v!, description: e.target.value }))} className={inputClass} /></Field>
          <div className="flex gap-2">
            <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Speichern</button>
            <button onClick={() => setEdit(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TeamsTab({ teams, onRefresh }: { teams: Team[]; onRefresh: () => void }) {
  const [edit, setEdit] = useState<Partial<Team> & { newPassword?: string; clearPassword?: boolean } | null>(null);

  async function save() {
    if (!edit) return;
    const method = edit.id ? "PUT" : "POST";
    const payload = {
      ...edit,
      password: edit.clearPassword ? null : (edit.newPassword || undefined),
    };
    await fetch("/api/teams", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setEdit(null); onRefresh();
  }

  async function del(id: number) {
    if (!confirm("Team löschen?")) return;
    await fetch("/api/teams", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    onRefresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Einsatzgruppen</h3>
        <button onClick={() => setEdit({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ Hinzufügen</button>
      </div>
      {teams.map(t => (
        <div key={t.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3">
          <div className="flex-1">
            <p className="font-medium text-gray-800 dark:text-gray-100">👥 {t.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {t.has_password ? <span className="text-green-600">✓ Login aktiv</span> : <span className="text-gray-400">Kein Login</span>}
            </p>
          </div>
          <button onClick={() => setEdit({ ...t, newPassword: "" })} className="text-xs text-blue-600 hover:underline mr-2">Bearbeiten</button>
          <button onClick={() => del(t.id)} className="text-xs text-red-500 hover:underline">Löschen</button>
        </div>
      ))}
      {edit !== null && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <Field label="Name"><input value={edit.name ?? ""} onChange={e => setEdit(v => ({ ...v!, name: e.target.value }))} className={inputClass} /></Field>
          <Field label="Login-Passwort für dieses Team">
            <input
              type="password" value={edit.newPassword ?? ""}
              onChange={e => setEdit(v => ({ ...v!, newPassword: e.target.value, clearPassword: false }))}
              className={inputClass} placeholder={edit.has_password ? "Neues Passwort (leer = nicht ändern)" : "Passwort setzen für Team-Login"}
            />
          </Field>
          {edit.has_password && (
            <label className="flex items-center gap-2 text-sm text-red-600 cursor-pointer">
              <input type="checkbox" checked={edit.clearPassword ?? false}
                onChange={e => setEdit(v => ({ ...v!, clearPassword: e.target.checked, newPassword: "" }))} />
              Login-Passwort entfernen
            </label>
          )}
          <div className="flex gap-2">
            <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Speichern</button>
            <button onClick={() => setEdit(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ApiKeySettings() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/settings").then(r => r.json()).then(d => { setApiKey(d.apiKey); setLoading(false); });
  }, []);

  async function generate() {
    const r = await fetch("/api/settings", { method: "POST" });
    const d = await r.json();
    setApiKey(d.apiKey);
  }

  async function revoke() {
    if (!confirm("API-Key wirklich widerrufen? Drittanbieter verlieren sofort den Zugang.")) return;
    await fetch("/api/settings", { method: "DELETE" });
    setApiKey(null);
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) return <p className="text-gray-400 text-sm">Laden...</p>;

  const exampleUrl = `${origin}/api/import`;

  return (
    <div className="space-y-5 max-w-lg">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Drittanbieter-API</h3>
        {apiKey ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Aktiver API-Key</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono text-gray-700 break-all">{apiKey}</code>
                <button onClick={() => copy(apiKey)} className="shrink-0 text-xs bg-gray-100 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-200">
                  {copied ? "✓" : "Kopieren"}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={generate} className="text-sm bg-blue-50 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg hover:bg-blue-100">Neu generieren</button>
              <button onClick={revoke} className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100">Widerrufen</button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-3">Kein API-Key vorhanden. Generiere einen um Drittanbietern Importzugang zu geben.</p>
            <button onClick={generate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700">API-Key generieren</button>
          </div>
        )}
      </div>

      {apiKey && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
          <h4 className="font-semibold text-gray-700 text-sm">Dokumentation für Drittanbieter</h4>
          <div className="text-xs text-gray-600 space-y-2">
            <p><strong>Endpunkt:</strong></p>
            <code className="block bg-white border border-gray-200 rounded px-2 py-1.5 font-mono">{exampleUrl}</code>
            <p className="mt-2"><strong>Methode:</strong> POST | Header: <code className="bg-white border border-gray-200 rounded px-1">x-api-key: {apiKey.slice(0, 8)}...</code></p>
            <p className="mt-2"><strong>Beispiel-Body:</strong></p>
            <pre className="bg-white border border-gray-200 rounded p-2 overflow-x-auto text-xs">{JSON.stringify({
              pruefungs_id: "P-2026-001",
              date: "2026-06-15",
              start_time: "09:00",
              end_time: "10:30",
              title: "Dressur Klasse A",
              phase: "wettkampf",
              arena_name: "Hauptplatz",
              team_name: "Ordnerdienst",
              notes: "Richter: Müller",
              source: "FN-Portal"
            }, null, 2)}</pre>
            <p className="text-gray-400">Gleiches Objekt mehrfach als Array <code className="bg-white border border-gray-200 rounded px-1">[…]</code> für Bulk-Import.</p>
            <p className="text-gray-400">Existiert die <code className="bg-white border border-gray-200 rounded px-1">pruefungs_id</code> bereits, wird der Eintrag automatisch aktualisiert (Upsert).</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ShareTab({ tournamentId }: { tournamentId?: number }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!tournamentId) return;
    fetch(`/api/tournaments/${tournamentId}`).then(r => r.ok ? r.json() : null).then(d => setToken(d?.share_token ?? null));
  }, [tournamentId]);

  async function generate() {
    if (!tournamentId) return;
    const r = await fetch(`/api/tournaments/${tournamentId}/share`, { method: "POST" });
    const d = await r.json();
    setToken(d.token);
  }

  async function revoke() {
    if (!tournamentId || !confirm("Share-Link wirklich deaktivieren?")) return;
    await fetch(`/api/tournaments/${tournamentId}/share`, { method: "DELETE" });
    setToken(null);
  }

  function copy(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!tournamentId) return <p className="text-gray-400 text-sm">Kein Turnier aktiv.</p>;
  if (token === undefined) return <p className="text-gray-400 text-sm">Laden...</p>;

  const shareUrl = token ? `${origin}/share/${token}` : null;

  return (
    <div className="space-y-4 max-w-lg">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            <span className="text-lg">🔗</span> Öffentlicher Share-Link
          </h3>
          <p className="text-xs text-gray-400 mt-1">Der Link kann ohne Login im Browser geöffnet werden – ideal für Großbildschirme, Tablets oder zur Weitergabe an Zuschauer.</p>
        </div>

        {shareUrl ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Aktiver Link</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-xs font-mono text-indigo-700 break-all">{shareUrl}</code>
                <button onClick={() => copy(shareUrl)} className="shrink-0 text-xs bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-100 font-medium">
                  {copied ? "✓" : "Kopieren"}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={shareUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 font-medium transition">
                Link öffnen →
              </a>
              <button onClick={revoke} className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 transition">Deaktivieren</button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-3">Noch kein Share-Link aktiv.</p>
            <button onClick={generate} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
              Share-Link generieren
            </button>
          </div>
        )}
      </div>

      {shareUrl && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 text-xs text-gray-500 space-y-1">
          <p className="font-medium text-gray-600">Die Share-Ansicht zeigt:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Alle Einträge des aktuellen Turniers</li>
            <li>Platz-Filter (Hauptplatz, Nebenplatz…)</li>
            <li>Tag-Navigation bei mehrtägigen Turnieren</li>
            <li>LIVE-Badge für aktuell laufende Einträge</li>
            <li>Automatisches Grau-werden abgeschlossener Einträge</li>
            <li>Live-Uhr und Scroll-zu-aktuell-Button</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function PasswordSettings() {
  const [viewerPw, setViewerPw] = useState("");
  const [adminPw, setAdminPw] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    await fetch("/api/auth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ viewerPassword: viewerPw || undefined, adminPassword: adminPw || undefined }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    setViewerPw(""); setAdminPw("");
  }

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4 max-w-sm">
      <h3 className="font-semibold text-gray-700 dark:text-gray-200">Passwörter ändern</h3>
      <Field label="Neues Viewer-Passwort">
        <input type="password" value={viewerPw} onChange={e => setViewerPw(e.target.value)} className={inputClass} placeholder="Leer lassen = nicht ändern" />
      </Field>
      <Field label="Neues Admin-Passwort">
        <input type="password" value={adminPw} onChange={e => setAdminPw(e.target.value)} className={inputClass} placeholder="Leer lassen = nicht ändern" />
      </Field>
      <button onClick={save} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
        {saved ? "✓ Gespeichert" : "Speichern"}
      </button>
      <p className="text-xs text-gray-400">Standard-Passwörter: viewer123 / admin123</p>
    </div>
  );
}
