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
  helpers_needed?: number;
  helpers_task?: string;
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
  const [y, m, d] = date.split("-").map(Number);
  const nd = new Date(y, m - 1, d + n); // lokale Zeit, kein UTC
  return `${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, "0")}-${String(nd.getDate()).padStart(2, "0")}`;
}
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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

// ── Welcome + Login ──────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (s: AppSession) => void }) {
  const [screen, setScreen] = useState<"welcome" | "login" | "contact">("welcome");
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
      onLogin({ role: data.role, teamId: data.teamId, teamName: data.teamName, speakerId: data.speakerId, speakerName: data.speakerName, speakerRole: data.speakerRole, speakerColor: data.speakerColor, adminName: data.adminName, adminTournamentId: data.adminTournamentId });
    } else {
      setError("Falsches Passwort");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 flex flex-col items-center justify-center p-6 overflow-hidden touch-none select-none" style={{WebkitOverflowScrolling: "auto"}}>
      {/* Animated background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-24 w-80 h-80 bg-violet-500/15 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-1/4 -right-24 w-80 h-80 bg-indigo-400/15 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1.5s" }} />
        <div className="absolute top-3/4 left-1/3 w-48 h-48 bg-violet-600/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: "3s" }} />
      </div>

      <div className="relative w-full max-w-sm touch-auto select-text">
        {screen === "welcome" ? (
          <div className="text-center space-y-7 animate-fade-in">
            {/* Logo + Brand */}
            <div className="space-y-3">
              <img src="/logo.png" alt="EquiPlan" className="w-24 h-24 mx-auto object-contain drop-shadow-2xl rounded-2xl" />
              <div>
                <h1 className="text-5xl font-bold text-white tracking-tight">
                  Equi<span className="text-violet-400">Plan</span>
                </h1>
                <p className="text-indigo-200/80 mt-2 text-base font-light tracking-wide">
                  Turnierplanung. Einfach. Live.
                </p>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-indigo-200 text-sm leading-relaxed px-4">
              Der digitale Zeitplan für Pferdesport-Veranstaltungen —
              alle Beteiligten, alle Plätze, immer aktuell.
            </p>

            {/* CTA Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => setScreen("login")}
                className="w-full bg-white text-indigo-900 font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-900/40 hover:bg-indigo-50 transition text-base active:scale-95">
                Anmelden
              </button>
              <button
                onClick={() => setScreen("contact")}
                className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-3 rounded-xl border border-white/20 transition text-sm active:scale-95">
                Interesse? Jetzt anfragen
              </button>
            </div>
          </div>

        ) : screen === "contact" ? (
          <ContactForm onBack={() => setScreen("welcome")} />

        ) : (
          <div className="animate-fade-in">
            <button onClick={() => setScreen("welcome")} className="text-indigo-300 hover:text-white text-sm mb-5 flex items-center gap-1 transition">
              <ChevronLeft size={16} /> Zurück
            </button>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-7">
              <div className="text-center mb-5">
                <img src="/logo.png" alt="EquiPlan" className="w-12 h-12 mx-auto mb-3 object-contain" />
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
                  <span className="text-indigo-900 dark:text-indigo-400">Equi</span><span className="text-violet-600">Plan</span>
                </h2>
              </div>
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Passwort</label>
                  <input
                    type="password" value={password} onChange={e => setPassword(e.target.value)}
                    className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    placeholder="Zugangspasswort eingeben" autoFocus
                  />
                </div>
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button type="submit" disabled={loading}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50">
                  {loading ? "Anmelden..." : "Anmelden"}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.4s ease both; }
      `}</style>
    </div>
  );
}

// ── Contact Form ─────────────────────────────────────────────────────────────
function ContactForm({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email) return;
    setStatus("sending");
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setStatus(res.ok ? "done" : "error");
  }

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="text-indigo-300 hover:text-white text-sm mb-5 flex items-center gap-1 transition">
        <ChevronLeft size={16} /> Zurück
      </button>
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-7">
        {status === "done" ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">✅</div>
            <h3 className="font-bold text-gray-800 dark:text-gray-100 text-lg">Nachricht gesendet!</h3>
            <p className="text-gray-500 dark:text-gray-400 text-sm">Wir melden uns so schnell wie möglich bei dir.</p>
            <button onClick={onBack} className="mt-2 text-indigo-600 dark:text-indigo-400 text-sm hover:underline">Zurück zur Startseite</button>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Interesse an EquiPlan?</h2>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 leading-relaxed">
                Hinterlasse deine Kontaktdaten – wir zeigen dir wie EquiPlan deine Veranstaltung vereinfacht.
              </p>
            </div>
            <form onSubmit={submit} className="space-y-3">
              <input
                value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
                placeholder="Dein Name *" required autoFocus
              />
              <input
                type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400"
                placeholder="E-Mail-Adresse *" required
              />
              <textarea
                value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                className="w-full border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 resize-none"
                placeholder="Kurze Nachricht (optional) – z.B. Veranstaltungsort, Turniergröße…"
                rows={3}
              />
              {status === "error" && <p className="text-red-500 text-sm">Fehler beim Senden. Bitte versuche es erneut.</p>}
              <button type="submit" disabled={status === "sending"}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50 text-sm">
                {status === "sending" ? "Wird gesendet…" : "Anfrage absenden →"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

// ── Onboarding Overlay ────────────────────────────────────────────────────────
const ONBOARDING_KEY = "equiplan-onboarded-v1";

function OnboardingOverlay({ session, onDone }: { session: AppSession; onDone: () => void }) {
  const [step, setStep] = useState(0);

  const steps = getOnboardingSteps(session);
  const isLast = step === steps.length - 1;

  function finish() { localStorage.setItem(ONBOARDING_KEY + "-" + session.role, "1"); onDone(); }
  function next() { isLast ? finish() : setStep(s => s + 1); }
  function prev() { setStep(s => s - 1); }

  const s = steps[step];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-700">
          <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
        </div>

        <div className="p-6">
          <div className="text-4xl mb-3 text-center">{s.icon}</div>
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 text-center">{s.title}</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-2 text-center leading-relaxed">{s.body}</p>

          {s.visual && (
            <div className="mt-4 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-3">
              {s.visual}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex items-center justify-between gap-3">
          <button onClick={finish} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition">
            Überspringen
          </button>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <button onClick={prev} className="px-3 py-2 border border-gray-200 dark:border-gray-600 dark:text-gray-200 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                Zurück
              </button>
            )}
            <button onClick={next} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition">
              {isLast ? "Los geht's! 🎉" : "Weiter →"}
            </button>
          </div>
        </div>

        {/* Step dots */}
        <div className="pb-4 flex justify-center gap-1.5">
          {steps.map((_, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full transition-all ${i === step ? "bg-indigo-600 w-4" : "bg-gray-300 dark:bg-gray-600"}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function getOnboardingSteps(session: AppSession) {
  const base = [
    {
      icon: "👋",
      title: `Willkommen bei EquiPlan${session.teamName ? `, ${session.teamName}` : session.speakerName ? `, ${session.speakerName}` : ""}!`,
      body: "EquiPlan ist dein internes Tool für die Turnierplanung. Hier siehst du den gesamten Tagesablauf auf einen Blick.",
      visual: null,
    },
    {
      icon: "📅",
      title: "Tage wechseln",
      body: "Mit den Pfeilen ◀ ▶ blätterst du zwischen den Tagen. Mit \"Heute\" springst du direkt auf den aktuellen Tag. Du kannst auch das Datum direkt anklicken.",
      visual: (
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg p-2 text-sm">
          <span className="text-indigo-400 font-bold text-lg">‹</span>
          <span className="text-gray-700 dark:text-gray-200 font-medium">Mittwoch, 4. Jun</span>
          <span className="text-indigo-400 font-bold text-lg">›</span>
        </div>
      ),
    },
    {
      icon: "🏟️",
      title: "Plätze & Phasen",
      body: "Jeder Eintrag hat einen Platz und eine Phase. Farben helfen dir schnell zu sehen was läuft: 🟠 Aufbau · 🔵 Wettkampf · 🟣 Abbau",
      visual: (
        <div className="space-y-1.5 text-xs">
          {[["🟠","Aufbau","border-orange-300 bg-orange-50"],["🔵","Wettkampf","border-blue-300 bg-blue-50"],["🟣","Abbau","border-purple-300 bg-purple-50"]].map(([e,l,c]) => (
            <div key={l} className={`flex items-center gap-2 rounded px-2 py-1 border-l-4 ${c}`}>
              <span>{e}</span><span className="font-medium text-gray-700">{l}</span>
            </div>
          ))}
        </div>
      ),
    },
    ...getRoleSteps(session),
    {
      icon: "🔔",
      title: "Benachrichtigungen",
      body: "Aktiviere Push-Benachrichtigungen mit dem 🔔-Symbol oben rechts. Du wirst sofort informiert wenn der Plan geändert wird.",
      visual: null,
    },
  ];
  return base;
}

function getRoleSteps(session: AppSession) {
  if (session.role === "admin") {
    return [{
      icon: "⚙️",
      title: "Du bist Administrator",
      body: "Mit dem ⚙️-Button oben rechts öffnest du den Admin-Bereich. Dort kannst du Einträge anlegen, bearbeiten, Teams und Sprecher verwalten und Share-Links erstellen.",
      visual: null,
    }];
  }
  if (session.role === "team") {
    return [{
      icon: "👥",
      title: `Deine Einsätze als ${session.teamName}`,
      body: "Alle Einträge wo dein Team eingeteilt ist, werden lila hervorgehoben mit dem Badge \"Ihr Einsatz\". So siehst du auf einen Blick wann du gefragt bist.",
      visual: (
        <div className="rounded-lg border-l-4 border-violet-500 bg-violet-50 dark:bg-violet-900/30 p-2 text-xs">
          <div className="flex justify-between">
            <span className="font-bold text-violet-900 dark:text-violet-200">Prüfung 01 – Dressur</span>
            <span className="font-mono text-violet-700 dark:text-violet-300">09:00–11:00</span>
          </div>
          <span className="bg-violet-600 text-white px-1.5 py-0.5 rounded text-xs font-semibold mt-1 inline-block">Ihr Einsatz</span>
        </div>
      ),
    }];
  }
  if (session.role === "speaker") {
    return [{
      icon: "🎙️",
      title: `Du bist eingeloggt als ${session.speakerName}`,
      body: "Alle Einträge wo du als Sprecher eingeteilt bist, werden farbig hervorgehoben. Dein Name erscheint auch im Header damit alle wissen wer eingeloggt ist.",
      visual: (
        <div className="flex items-center gap-2 text-xs">
          <span className="rounded-full px-2 py-1 text-white font-medium" style={{ backgroundColor: session.speakerColor || "#6366f1" }}>
            🎙 {session.speakerName} · {session.speakerRole}
          </span>
          <span className="text-gray-500 dark:text-gray-400">= deine Einträge</span>
        </div>
      ),
    }];
  }
  return [{
    icon: "👁️",
    title: "Viewer-Zugang",
    body: "Du kannst den gesamten Zeitplan einsehen und zwischen Tagen navigieren. Änderungen sind nur für Administratoren möglich.",
    visual: null,
  }];
}

function isEntryDone(entry: ScheduleEntry): boolean {
  const now = new Date();
  const end = new Date(`${entry.date}T${entry.end_time}:00`);
  return end < now;
}

function EntryCard({ entry, myTeamId, session }: { entry: ScheduleEntry; myTeamId?: number; session?: AppSession | null }) {
  const [open, setOpen] = useState(false);
  const done = isEntryDone(entry);
  const isMyTeam = myTeamId != null && entry.teams?.some(t => t.id === myTeamId);
  const phase = PHASE_CONFIG[entry.phase] ?? PHASE_CONFIG.pause;

  const cardContent = (
    <>
      {done ? (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-50 space-y-1 cursor-pointer hover:opacity-70 transition-opacity">
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
      ) : isMyTeam ? (
        <div className="rounded-xl border-l-4 border-violet-500 bg-violet-50 p-3 space-y-1 ring-2 ring-violet-300 shadow-md cursor-pointer hover:brightness-95 transition">
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
      ) : (
        <div className={`rounded-xl border-l-4 ${phase.border} ${phase.bg} p-3 space-y-1 cursor-pointer hover:brightness-95 transition`}>
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
          {(entry.helpers_needed ?? 0) > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 w-fit mt-1">
              🙋 {entry.helpers_needed} Helfer gesucht{entry.helpers_task ? ` · ${entry.helpers_task}` : ""}
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <div onClick={() => setOpen(true)}>{cardContent}</div>
      {open && <EntryDetailModal entry={entry} session={session ?? null} onClose={() => setOpen(false)} />}
    </>
  );
}

interface HelperEntry { id: number; name: string; contact: string; note?: string; signed_up_at: string; }

function PdfFullscreen({ doc, onClose }: { doc: DocMeta; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-[5vh_5vw]" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full h-full max-w-[90vw] max-h-[90vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0 rounded-t-2xl">
          <p className="font-medium text-sm text-gray-800 dark:text-gray-100 truncate flex-1">{doc.original_name}</p>
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <a href={`/api/documents/${doc.id}`} download={doc.original_name}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline border border-indigo-200 dark:border-indigo-700 px-3 py-1 rounded-lg transition">
              ⬇ Download
            </a>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-white text-xl leading-none transition">✕</button>
          </div>
        </div>
        <iframe src={`/api/documents/${doc.id}`} className="flex-1 w-full rounded-b-2xl" title={doc.original_name} />
      </div>
    </div>
  );
}

function EntryDetailModal({ entry, session, onClose }: { entry: ScheduleEntry; session: AppSession | null; onClose: () => void }) {
  const phase = PHASE_CONFIG[entry.phase] ?? PHASE_CONFIG.pause;
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [fullscreenDoc, setFullscreenDoc] = useState<DocMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [helpers, setHelpers] = useState<HelperEntry[]>([]);

  const loadHelpers = useCallback(async () => {
    if (session?.role !== "admin" && session?.role !== "viewer") return;
    const r = await fetch(`/api/helpers?entry_id=${entry.id}`);
    if (r.ok) setHelpers(await r.json());
  }, [entry.id, session?.role]);

  useEffect(() => { loadHelpers(); }, [loadHelpers]);

  async function removeHelper(id: number) {
    await fetch("/api/helpers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setHelpers(prev => prev.filter(h => h.id !== id));
  }

  const loadDocs = useCallback(async () => {
    const r = await fetch(`/api/documents?entry_id=${entry.id}`);
    if (r.ok) setDocs(await r.json());
  }, [entry.id]);

  useEffect(() => { loadDocs(); }, [loadDocs]);

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(""); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entry_id", String(entry.id));
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    if (!r.ok) { const d = await r.json(); setUploadError(d.error || "Upload fehlgeschlagen"); }
    else await loadDocs();
    setUploading(false);
    e.target.value = "";
  }

  async function removeDoc(id: number, name: string) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    await fetch("/api/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className={`p-4 border-b border-gray-200 dark:border-gray-700 ${phase.bg} dark:bg-gray-800`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white border ${phase.border} mr-2`}>{phase.label}</span>
              <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg mt-1">
                {entry.pruefungs_id && <span className="text-gray-400 font-normal mr-1 text-sm">{entry.pruefungs_id}</span>}
                {entry.title}
              </h2>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none shrink-0">✕</button>
          </div>
          <p className="text-sm font-mono text-gray-600 dark:text-gray-400 mt-1">{entry.start_time} – {entry.end_time}</p>
        </div>

        {/* Details */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {entry.arena_name && <span className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1">📍 {entry.arena_name}</span>}
            {entry.teams?.map(t => <span key={t.id} className="bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-1">👥 {t.name}</span>)}
            {entry.speaker_name && (
              <span className="rounded-lg px-3 py-1 text-white text-sm" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
                🎙 {entry.speaker_name} {entry.speaker_role && `(${entry.speaker_role})`}
              </span>
            )}
          </div>
          {entry.notes && <p className="text-sm text-gray-600 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-800 rounded-lg p-3">{entry.notes}</p>}
          {entry.external_source && <p className="text-xs text-gray-400">Quelle: {entry.external_source}</p>}
        </div>

        {/* Helfer */}
        {(entry.helpers_needed ?? 0) > 0 && (session?.role === "admin" || session?.role === "viewer") && (
          <div className="px-4 pb-4 space-y-2 border-t border-gray-100 dark:border-gray-700 pt-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Helfer</h3>
                {entry.helpers_task && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Aufgabe: {entry.helpers_task}</p>}
              </div>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${helpers.length >= (entry.helpers_needed ?? 0) ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {helpers.length} / {entry.helpers_needed} besetzt
              </span>
            </div>
            {helpers.length === 0 && <p className="text-sm text-gray-400">Noch keine Anmeldungen.</p>}
            {helpers.map(h => (
              <div key={h.id} className="flex items-start gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{h.name}</p>
                  <p className="text-xs text-gray-500">{h.contact}</p>
                  {h.note && <p className="text-xs text-gray-400 italic">{h.note}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0">{new Date(h.signed_up_at).toLocaleDateString("de-DE")}</span>
                {session?.role === "admin" && (
                  <button onClick={() => removeHelper(h.id)} className="text-xs text-red-500 hover:underline shrink-0">✕</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Dokumente */}
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 dark:border-gray-700 pt-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Dokumente</h3>

          {docs.map(doc => (
            <div key={doc.id} className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-2 p-3">
              <span className="text-lg shrink-0">📄</span>
              <span className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{doc.original_name}</span>
              <button onClick={() => setFullscreenDoc(doc)}
                className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition shrink-0">
                Öffnen
              </button>
              {session?.role === "admin" && (
                <button onClick={() => removeDoc(doc.id, doc.original_name)} className="text-xs text-red-500 hover:underline shrink-0">Löschen</button>
              )}
            </div>
          ))}

          {docs.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500">Keine Dokumente hinterlegt.</p>}

          {session?.role === "admin" && (
            <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition ${uploading ? "bg-gray-300 text-gray-500" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
              {uploading ? "Hochladen…" : "📄 PDF hinzufügen"}
              <input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={upload} />
            </label>
          )}
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        </div>
      </div>
      {fullscreenDoc && <PdfFullscreen doc={fullscreenDoc} onClose={() => setFullscreenDoc(null)} />}
    </div>
  );
}

interface AppSession { role: string; teamId?: number; teamName?: string; speakerId?: number; speakerName?: string; speakerRole?: string; speakerColor?: string; adminName?: string; adminTournamentId?: number; }
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
  const [showOnboarding, setShowOnboarding] = useState(false);
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

  async function handleLogin(s: AppSession) {
    setSession(s);
    // Show-Admin: direkt zum eigenen Turnier
    if (s.role === "admin" && s.adminTournamentId) {
      const res = await fetch("/api/tournaments");
      if (res.ok) {
        const all: Tournament[] = await res.json();
        setTournaments(all);
        const mine = all.find(t => t.id === s.adminTournamentId);
        if (mine) setActiveTournament(mine);
      }
    }
    const seen = localStorage.getItem(ONBOARDING_KEY + "-" + s.role);
    if (!seen) setShowOnboarding(true);
  }
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
    <div className="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {showOnboarding && session && (
        <OnboardingOverlay session={session} onDone={() => setShowOnboarding(false)} />
      )}
      <header className="shrink-0 bg-gradient-to-r from-indigo-800 to-violet-700 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/logo.png" alt="EquiPlan" className="w-9 h-9 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
            <div className="min-w-0">
              <h1 className="font-bold text-lg leading-tight tracking-tight">
                <span className="text-white">Equi</span><span className="text-violet-300">Plan</span>
              </h1>
              <button onClick={() => !session?.adminTournamentId && setView("tournament-select")} className={`flex items-center gap-1 text-xs transition truncate max-w-[200px] ${session?.adminTournamentId ? "text-indigo-300 cursor-default" : "text-indigo-200 hover:text-white"}`}>
                <Trophy size={11} className="shrink-0" />
                <span className="truncate">{activeTournament.name}</span>
                <ChevronDown size={11} className="shrink-0" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {session?.role === "admin" && session.adminName && (
              <span className="text-xs bg-white/10 text-indigo-100 px-2 py-0.5 rounded-full mr-1 hidden sm:block">
                {session.adminTournamentId ? "🎪" : "⭐"} {session.adminName}
              </span>
            )}
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

      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 py-6">
          {view === "schedule" && <ScheduleTab entries={entries} selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} onRefresh={() => loadEntries(activeTournament.id, selectedDate)} activeTournamentId={activeTournament.id} />}
          {view === "admin" && <AdminTab onRefresh={() => loadEntries(activeTournament.id, selectedDate)} activeTournamentId={activeTournament.id} session={session} />}
        </div>
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
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-900 to-violet-800 flex flex-col items-center justify-center p-4 overflow-y-auto">
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

// ── Timeline View ────────────────────────────────────────────────────────────
const PX_PER_HOUR = 96; // Höhe pro Stunde in px
const PX_PER_MIN = PX_PER_HOUR / 60;

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const PHASE_TIMELINE: Record<string, { bg: string; border: string; text: string }> = {
  aufbau:    { bg: "bg-orange-100 dark:bg-orange-900/40", border: "border-orange-400", text: "text-orange-800 dark:text-orange-200" },
  wettkampf: { bg: "bg-blue-100 dark:bg-blue-900/40",   border: "border-blue-400",   text: "text-blue-800 dark:text-blue-200" },
  abbau:     { bg: "bg-purple-100 dark:bg-purple-900/40", border: "border-purple-400", text: "text-purple-800 dark:text-purple-200" },
  pause:     { bg: "bg-gray-100 dark:bg-gray-700",       border: "border-gray-300 dark:border-gray-500",   text: "text-gray-600 dark:text-gray-300" },
};

function TimelineView({ entries, selectedDate, session }: { entries: ScheduleEntry[]; selectedDate: string; session: AppSession | null }) {
  const myTeamId = session?.teamId;
  const mySpeakerId = session?.speakerId;
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Alle Plätze aus Einträgen (+ "Kein Platz" falls vorhanden)
  const arenaMap = new Map<number | null, string>();
  for (const e of entries) {
    if (e.arena_id != null) arenaMap.set(e.arena_id, e.arena_name ?? `Platz ${e.arena_id}`);
    else arenaMap.set(null, "– Kein Platz –");
  }
  const arenas: { id: number | null; name: string }[] = [];
  // Sortiere: null ans Ende
  const sortedKeys = [...arenaMap.keys()].sort((a, b) => a == null ? 1 : b == null ? -1 : (a as number) - (b as number));
  for (const k of sortedKeys) arenas.push({ id: k, name: arenaMap.get(k)! });

  // Zeitbereich berechnen
  let dayStart = 7 * 60; // 07:00
  let dayEnd = 21 * 60;  // 21:00
  if (entries.length > 0) {
    const starts = entries.map(e => toMinutes(e.start_time));
    const ends = entries.map(e => toMinutes(e.end_time));
    dayStart = Math.floor(Math.min(...starts) / 60) * 60;
    dayEnd = Math.ceil(Math.max(...ends) / 60) * 60;
    dayStart = Math.max(0, dayStart - 30); // 30 min Puffer oben
    dayEnd = Math.min(24 * 60, dayEnd + 30);
  }
  const totalMinutes = dayEnd - dayStart;
  const totalHeight = totalMinutes * PX_PER_MIN;

  // Stundenlinien
  const hourLines: number[] = [];
  for (let m = Math.ceil(dayStart / 60) * 60; m <= dayEnd; m += 60) hourLines.push(m);

  // Aktuelle Zeit
  const isToday = selectedDate === today();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showNowLine = isToday && nowMinutes >= dayStart && nowMinutes <= dayEnd;
  const nowTop = (nowMinutes - dayStart) * PX_PER_MIN;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <div className="flex min-w-max">
        {/* Zeitachse */}
        <div className="w-14 shrink-0 relative" style={{ height: totalHeight + 32 }}>
          <div className="h-8 border-b border-gray-200 dark:border-gray-700" /> {/* Header-Leerzeile */}
          <div className="relative" style={{ height: totalHeight }}>
            {hourLines.map(m => (
              <div key={m} className="absolute left-0 right-0 flex items-center" style={{ top: (m - dayStart) * PX_PER_MIN }}>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 px-1.5 font-mono leading-none">
                  {String(Math.floor(m / 60)).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Platz-Spalten */}
        {arenas.map(arena => {
          const col = entries.filter(e => (e.arena_id ?? null) === arena.id);
          return (
            <div key={String(arena.id)} className="flex-1 min-w-[180px] border-l border-gray-200 dark:border-gray-700">
              {/* Spalten-Header */}
              <div className="h-8 flex items-center justify-center border-b border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/20 px-2">
                <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 truncate text-center">📍 {arena.name}</span>
              </div>
              {/* Inhalt */}
              <div className="relative" style={{ height: totalHeight }}>
                {/* Stunden-Rasterlinien */}
                {hourLines.map(m => (
                  <div key={m} className="absolute left-0 right-0 border-t border-gray-100 dark:border-gray-700/60"
                    style={{ top: (m - dayStart) * PX_PER_MIN }} />
                ))}
                {/* Jetzt-Linie */}
                {showNowLine && (
                  <div className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: nowTop }}>
                    <div className="h-0.5 bg-red-500 w-full" />
                    <div className="absolute -top-1.5 -left-1 w-3 h-3 bg-red-500 rounded-full" />
                  </div>
                )}
                {/* Einträge */}
                {col.map(entry => {
                  const startMin = toMinutes(entry.start_time);
                  const endMin = toMinutes(entry.end_time);
                  const duration = Math.max(endMin - startMin, 15);
                  const top = (startMin - dayStart) * PX_PER_MIN;
                  const height = Math.max(duration * PX_PER_MIN, 28);
                  const done = isEntryDone(entry);
                  const isMyTeam = myTeamId != null && entry.teams?.some(t => t.id === myTeamId);
                  const isMySpeaker = mySpeakerId != null && entry.speaker_id === mySpeakerId;
                  const phase = PHASE_TIMELINE[entry.phase] ?? PHASE_TIMELINE.pause;

                  let blockCls = `absolute left-1 right-1 rounded-lg border-l-4 overflow-hidden cursor-default transition-opacity px-1.5 py-1 ${phase.bg} ${phase.border} ${phase.text}`;
                  if (done) blockCls += " opacity-40";
                  if (isMyTeam) blockCls = `absolute left-1 right-1 rounded-lg border-l-4 overflow-hidden cursor-default transition-opacity px-1.5 py-1 bg-violet-100 dark:bg-violet-900/40 border-violet-500 text-violet-900 dark:text-violet-200 ring-1 ring-violet-400`;
                  if (isMySpeaker && !isMyTeam) blockCls = `absolute left-1 right-1 rounded-lg border-l-4 overflow-hidden cursor-default transition-opacity px-1.5 py-1 bg-indigo-100 dark:bg-indigo-900/40 border-indigo-500 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-400`;

                  return (
                    <div key={entry.id} className={blockCls} style={{ top, height, zIndex: 10 }}
                      title={`${entry.pruefungs_id ? entry.pruefungs_id + " · " : ""}${entry.title}\n${entry.start_time}–${entry.end_time}${entry.teams?.length ? "\n" + entry.teams.map(t => t.name).join(", ") : ""}`}>
                      <div className="font-semibold leading-tight truncate" style={{ fontSize: height < 36 ? "9px" : "11px" }}>
                        {entry.pruefungs_id && <span className="opacity-60 mr-1">{entry.pruefungs_id}</span>}
                        {entry.title}
                      </div>
                      {height >= 36 && (
                        <div className="font-mono opacity-70" style={{ fontSize: "9px" }}>{entry.start_time}–{entry.end_time}</div>
                      )}
                      {height >= 52 && entry.teams && entry.teams.length > 0 && (
                        <div className="truncate opacity-70" style={{ fontSize: "9px" }}>
                          👥 {entry.teams.map(t => t.name).join(", ")}
                        </div>
                      )}
                      {height >= 64 && entry.speaker_name && (
                        <div className="truncate" style={{ fontSize: "9px" }}>
                          <span className="rounded px-1 text-white" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
                            🎙 {entry.speaker_name}
                          </span>
                        </div>
                      )}
                      {done && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="border-t border-current w-full opacity-30" />
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
      <div className="border-t border-gray-100 dark:border-gray-700 px-4 py-2 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/50">
        {Object.entries(PHASE_CONFIG).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-sm border-l-2 ${PHASE_TIMELINE[k].border} ${PHASE_TIMELINE[k].bg}`} />
            {v.label}
          </span>
        ))}
        {showNowLine && <span className="flex items-center gap-1 text-red-500 font-semibold"><span className="w-2.5 h-0.5 bg-red-500 inline-block" /> Jetzt</span>}
      </div>
    </div>
  );
}

function ScheduleTab({ entries, selectedDate, setSelectedDate, session, onRefresh, activeTournamentId }: {
  entries: ScheduleEntry[]; selectedDate: string; setSelectedDate: (d: string) => void; session: AppSession | null; onRefresh: () => void; activeTournamentId?: number;
}) {
  void onRefresh;
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const canFilterOwn = session?.role === "team" || session?.role === "speaker";
  const [showOnlyMine, setShowOnlyMine] = useState(canFilterOwn);

  const filteredEntries = showOnlyMine && canFilterOwn
    ? entries.filter(e => {
        if (session?.role === "team") return e.teams.some(t => t.id === session.teamId);
        if (session?.role === "speaker") return e.speaker_id === session.speakerId;
        return true;
      })
    : entries;

  const myTeamId = session?.teamId;
  return (
    <div>
      <div className="flex items-center justify-between mb-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm gap-2">
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

      {/* Toolbar: Ansicht + Filter */}
      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setViewMode("list")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === "list" ? "bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            ≡ Liste
          </button>
          <button
            onClick={() => setViewMode("timeline")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition ${viewMode === "timeline" ? "bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"}`}
          >
            ▦ Zeitleiste
          </button>
        </div>

        {canFilterOwn && (
          <button
            onClick={() => setShowOnlyMine(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              showOnlyMine
                ? "bg-violet-600 text-white border-violet-600"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            {showOnlyMine ? "👤 Nur meine Einsätze" : "👥 Alle Einträge"}
          </button>
        )}
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p>{showOnlyMine && canFilterOwn ? "Keine eigenen Einsätze für diesen Tag." : "Keine Einträge für diesen Tag."}</p>
          {session?.role === "admin" && <p className="text-sm mt-1">Im ⚙️ Admin-Bereich Einträge anlegen.</p>}
          {session?.role === "team" && showOnlyMine && <p className="text-sm mt-1 text-violet-600">Heute keine Einsätze für {session.teamName}.</p>}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filteredEntries.map(e => <EntryCard key={e.id} entry={e} myTeamId={myTeamId} session={session} />)}
        </div>
      ) : (
        <TimelineView entries={filteredEntries} selectedDate={selectedDate} session={session} />
      )}

      {/* Dokumente */}
      {activeTournamentId && <DocumentsViewer tournamentId={activeTournamentId} />}
    </div>
  );
}

function AdminTab({ onRefresh, activeTournamentId, session }: { onRefresh: () => void; activeTournamentId?: number; session: AppSession | null }) {
  const isSuperAdmin = !session?.adminTournamentId;
  const [tab, setTab] = useState<"entries" | "speakers" | "arenas" | "teams" | "settings" | "api" | "share" | "inquiries" | "documents" | "admins">("entries");
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
    { key: "inquiries", label: "Anfragen" },
    { key: "documents", label: "📄 Dokumente" },
    ...(isSuperAdmin ? [{ key: "admins" as const, label: "👥 Admins" }] : []),
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
              <div className="flex-1"><EntryCard entry={e} session={{ role: "admin" }} /></div>
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
      {tab === "inquiries" && <InquiriesTab />}
      {tab === "documents" && <DocumentsAdminTab tournamentId={activeTournamentId} />}
      {tab === "admins" && isSuperAdmin && <AdminsTab />}

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
          <div className="border border-gray-200 dark:border-gray-600 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Helfer benötigt</p>
                <p className="text-xs text-gray-400">Externe können sich über den Share-Link anmelden</p>
              </div>
              <button
                type="button"
                onClick={() => set("helpers_needed", (form.helpers_needed ?? 0) > 0 ? 0 : 1)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${(form.helpers_needed ?? 0) > 0 ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${(form.helpers_needed ?? 0) > 0 ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {(form.helpers_needed ?? 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm text-gray-600 dark:text-gray-300">Anzahl benötigt:</label>
                  <input
                    type="number" min={1} max={99}
                    value={form.helpers_needed ?? 1}
                    onChange={e => set("helpers_needed", Math.max(1, Number(e.target.value)))}
                    className={`${inputClass} w-20`}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600 dark:text-gray-300 block mb-1">Aufgabe der Helfer</label>
                  <input
                    type="text"
                    value={form.helpers_task ?? ""}
                    onChange={e => set("helpers_task", e.target.value || undefined)}
                    placeholder="z.B. Aufbau der Hindernisse, Einlassdienst..."
                    className={inputClass}
                  />
                </div>
              </div>
            )}
          </div>
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

  async function del(id: number) {
    if (!confirm("Sprecher wirklich löschen?")) return;
    await fetch("/api/speakers", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    onRefresh();
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
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Sprecher ({speakers.length})</h3>
        <button onClick={() => { setEdit({ color: "#3B82F6" }); setNewPassword(""); }} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ Hinzufügen</button>
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
            <button onClick={() => del(s.id)} className="text-xs text-red-500 hover:underline">Löschen</button>
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

function InquiriesTab() {
  const [inquiries, setInquiries] = useState<{ id: number; name: string; email: string; message?: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/contact").then(r => r.json()).then(d => { setInquiries(Array.isArray(d) ? d : []); setLoading(false); });
  }, []);

  if (loading) return <p className="text-gray-400 text-sm py-4">Laden…</p>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Kontaktanfragen ({inquiries.length})</h3>
      </div>
      {inquiries.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-sm">Noch keine Anfragen eingegangen.</p>
        </div>
      ) : inquiries.map(q => (
        <div key={q.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-gray-800 dark:text-gray-100">{q.name}</p>
              <a href={`mailto:${q.email}`} className="text-indigo-600 dark:text-indigo-400 text-sm hover:underline">{q.email}</a>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{new Date(q.created_at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          {q.message && <p className="text-sm text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700 pt-2 mt-2">{q.message}</p>}
        </div>
      ))}
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

// ── Dokumente: Admin-Upload ───────────────────────────────────────────────────
interface DocMeta { id: number; original_name: string; size: number; uploaded_at: string; entry_id?: number; tournament_id?: number; }

function DocUploadButton({ onUploaded, tournamentId, label }: { onUploaded: () => void; tournamentId?: number; label: string }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    if (tournamentId) fd.append("tournament_id", String(tournamentId));
    const r = await fetch("/api/documents", { method: "POST", body: fd });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Upload fehlgeschlagen"); }
    else onUploaded();
    setUploading(false);
    e.target.value = "";
  }

  return (
    <div>
      <label className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium cursor-pointer transition ${uploading ? "bg-gray-300 text-gray-500" : "bg-indigo-600 text-white hover:bg-indigo-700"}`}>
        {uploading ? "Hochladen…" : `📄 ${label}`}
        <input type="file" accept="application/pdf" className="hidden" disabled={uploading} onChange={upload} />
      </label>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

function DocList({ docs, onDelete }: { docs: DocMeta[]; onDelete: (id: number, name: string) => void }) {
  if (docs.length === 0) return <p className="text-sm text-gray-400 dark:text-gray-500 py-2">Keine Dokumente.</p>;
  return (
    <div className="space-y-2 mt-3">
      {docs.map(doc => (
        <div key={doc.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700 rounded-lg px-3 py-2">
          <span className="text-base shrink-0">📄</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{doc.original_name}</p>
            <p className="text-xs text-gray-400">{(doc.size / 1024).toFixed(0)} KB · {new Date(doc.uploaded_at).toLocaleDateString("de-DE")}</p>
          </div>
          <a href={`/api/documents/${doc.id}`} target="_blank" rel="noopener noreferrer"
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline shrink-0">Öffnen</a>
          <button onClick={() => onDelete(doc.id, doc.original_name)} className="text-xs text-red-500 hover:underline shrink-0">Löschen</button>
        </div>
      ))}
    </div>
  );
}

function DocumentsAdminTab({ tournamentId }: { tournamentId?: number }) {
  const [generalDocs, setGeneralDocs] = useState<DocMeta[]>([]);
  const [tournamentDocs, setTournamentDocs] = useState<DocMeta[]>([]);

  const loadGeneral = useCallback(async () => {
    const r = await fetch("/api/documents?scope=general");
    if (r.ok) setGeneralDocs(await r.json());
  }, []);

  const loadTournament = useCallback(async () => {
    if (!tournamentId) return;
    const r = await fetch(`/api/documents?tournament_id=${tournamentId}`);
    if (r.ok) setTournamentDocs(await r.json());
  }, [tournamentId]);

  useEffect(() => { loadGeneral(); loadTournament(); }, [loadGeneral, loadTournament]);

  async function remove(id: number, name: string, setter: React.Dispatch<React.SetStateAction<DocMeta[]>>) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    await fetch("/api/documents", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setter(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-5">
      {/* Allgemeine Dokumente */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Allgemeine Dokumente</h3>
            <p className="text-xs text-gray-400 mt-0.5">Sichtbar bei allen Turnieren</p>
          </div>
          <DocUploadButton onUploaded={loadGeneral} label="Hochladen" />
        </div>
        <DocList docs={generalDocs} onDelete={(id, n) => remove(id, n, setGeneralDocs)} />
      </div>

      {/* Turnierspezifische Dokumente */}
      {tournamentId && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-semibold text-gray-700 dark:text-gray-200">Turnier-Dokumente</h3>
              <p className="text-xs text-gray-400 mt-0.5">Nur bei diesem Turnier sichtbar</p>
            </div>
            <DocUploadButton onUploaded={loadTournament} tournamentId={tournamentId} label="Hochladen" />
          </div>
          <DocList docs={tournamentDocs} onDelete={(id, n) => remove(id, n, setTournamentDocs)} />
        </div>
      )}

      <p className="text-xs text-gray-400 text-center">Event-spezifische Dokumente: Eintrag in der Liste anklicken → „📄 PDF hinzufügen"</p>
    </div>
  );
}

// ── Dokumente: Viewer für alle Nutzer ─────────────────────────────────────────
function DocumentsViewer({ tournamentId }: { tournamentId: number }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [fullscreenDoc, setFullscreenDoc] = useState<DocMeta | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/documents?scope=general").then(r => r.ok ? r.json() : []),
      fetch(`/api/documents?tournament_id=${tournamentId}`).then(r => r.ok ? r.json() : []),
    ]).then(([general, tournament]) => setDocs([...general, ...tournament]));
  }, [tournamentId]);

  if (docs.length === 0) return null;

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Dokumente</h3>
      <div className="space-y-2">
        {docs.map(doc => (
          <button
            key={doc.id}
            onClick={() => setFullscreenDoc(doc)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition text-left"
          >
            <span className="text-xl shrink-0">📄</span>
            <span className="flex-1 font-medium text-gray-800 dark:text-gray-100 truncate">{doc.original_name}</span>
            <span className="text-xs text-indigo-500 dark:text-indigo-400 shrink-0">Öffnen ↗</span>
          </button>
        ))}
      </div>
      {fullscreenDoc && <PdfFullscreen doc={fullscreenDoc} onClose={() => setFullscreenDoc(null)} />}
    </div>
  );
}

// ── Admins verwalten (nur Haupt-Admin) ───────────────────────────────────────
interface AdminRecord { id: number; name: string; tournament_id: number | null; tournament_name: string | null; created_at: string; }

function AdminsTab() {
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [form, setForm] = useState<{ name: string; password: string; tournament_id: string }>({ name: "", password: "", tournament_id: "" });
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const [a, t] = await Promise.all([
      fetch("/api/admins").then(r => r.ok ? r.json() : []),
      fetch("/api/tournaments").then(r => r.ok ? r.json() : []),
    ]);
    setAdmins(a); setTournaments(t);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name.trim() || (!editId && !form.password.trim())) { setError("Name und Passwort erforderlich"); return; }
    setSaving(true); setError("");
    const body = { ...form, tournament_id: form.tournament_id ? Number(form.tournament_id) : null, ...(editId ? { id: editId } : {}) };
    const r = await fetch("/api/admins", { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { const d = await r.json(); setError(d.error || "Fehler"); }
    else { setForm({ name: "", password: "", tournament_id: "" }); setEditId(null); await load(); }
    setSaving(false);
  }

  async function remove(id: number, name: string) {
    if (!confirm(`Admin "${name}" wirklich löschen?`)) return;
    await fetch("/api/admins", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setAdmins(prev => prev.filter(a => a.id !== id));
  }

  function startEdit(a: AdminRecord) {
    setEditId(a.id);
    setForm({ name: a.name, password: "", tournament_id: a.tournament_id ? String(a.tournament_id) : "" });
  }

  return (
    <div className="space-y-5">
      {/* Formular */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">{editId ? "Admin bearbeiten" : "Neuen Admin anlegen"}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Name</label>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="z.B. Maria Müller" className={inputClass} />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">{editId ? "Neues Passwort (leer = unverändert)" : "Passwort"}</label>
            <input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Passwort" className={inputClass} />
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Zugriff</label>
          <select value={form.tournament_id} onChange={e => setForm(f => ({ ...f, tournament_id: e.target.value }))} className={inputClass}>
            <option value="">⭐ Haupt-Admin (alle Turniere)</option>
            {tournaments.map(t => <option key={t.id} value={t.id}>🎪 Nur: {t.name}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "Speichern…" : editId ? "Aktualisieren" : "Anlegen"}
          </button>
          {editId && <button onClick={() => { setEditId(null); setForm({ name: "", password: "", tournament_id: "" }); }} className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">Abbrechen</button>}
        </div>
      </div>

      {/* Liste */}
      {admins.length === 0 && <p className="text-gray-400 text-center py-6">Noch keine zusätzlichen Admins angelegt.</p>}
      <div className="space-y-2">
        {admins.map(a => (
          <div key={a.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-center gap-3">
            <div className="text-xl">{a.tournament_id ? "🎪" : "⭐"}</div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-100">{a.name}</p>
              <p className="text-xs text-gray-400">
                {a.tournament_id ? `Nur Turnier: ${a.tournament_name ?? a.tournament_id}` : "Haupt-Admin · alle Turniere"}
              </p>
            </div>
            <button onClick={() => startEdit(a)} className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0">Bearbeiten</button>
            <button onClick={() => remove(a.id, a.name)} className="text-xs text-red-500 hover:underline shrink-0">Löschen</button>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400">Tipp: Haupt-Admins sehen alle Turniere. Show-Admins werden nach dem Login direkt zu ihrem Turnier weitergeleitet.</p>
    </div>
  );
}
