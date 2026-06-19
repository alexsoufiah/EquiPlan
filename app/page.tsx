"use client";
import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react";
import { LogOut, Settings, Bell, BellOff, RefreshCw, ChevronLeft, ChevronRight, Trophy, ChevronDown, Sun, Moon, Info } from "lucide-react";
import { useTheme } from "@/lib/theme";
import { useLang } from "@/lib/i18n";

const PhaseOverridesContext = createContext<{ overrides: Record<string, string>; setOverrides: (v: Record<string, string>) => void }>({ overrides: {}, setOverrides: () => {} });

// Verspätungen: arenaId -> Minuten (Schlüssel 0 = gilt für den ganzen Tag)
const DelayContext = createContext<Record<number, number>>({});

function addMinutesToTime(hhmm: string, min: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + min;
  const wrapped = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(wrapped / 60)).padStart(2, "0")}:${String(wrapped % 60).padStart(2, "0")}`;
}

function effectiveDelay(delays: Record<number, number>, arenaId?: number): number {
  if (arenaId != null && delays[arenaId] != null) return delays[arenaId];
  return delays[0] ?? 0;
}

// Types
interface Speaker { id: number; name: string; role: string; color: string; has_password?: number; }
interface Arena { id: number; name: string; description?: string; }
interface Team { id: number; name: string; description?: string; has_password?: number; }
interface Contact { id: number; tournament_id?: number; name: string; role?: string; phone?: string; }
interface Tournament { id: number; name: string; location?: string; start_date?: string; end_date?: string; logo_path?: string; }
interface ScheduleEntry {
  id: number; date: string; start_time: string; end_time: string;
  title: string; phase: string; pruefungs_id?: string; tournament_id?: number; arena_id?: number; speaker_id?: number;
  notes?: string; arena_name?: string; external_source?: string;
  speaker_name?: string; speaker_role?: string; speaker_color?: string;
  teams: { id: number; name: string }[];
  helpers_needed?: number;
  helpers_task?: string;
  delay_minutes?: number; // Verspätung nur für diesen Programmpunkt
}

const PHASE_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  aufbau:        { label: "Aufbau",        color: "text-orange-700 dark:text-orange-300", bg: "bg-orange-100 dark:bg-[#1c1c2e]",  border: "border-orange-400 dark:border-orange-800/60" },
  wettkampf:     { label: "Wettkampf",     color: "text-blue-700 dark:text-blue-300",     bg: "bg-blue-100 dark:bg-[#1c1c2e]",    border: "border-blue-400 dark:border-blue-800/60"     },
  siegerehrung:  { label: "Siegerehrung",  color: "text-yellow-700 dark:text-yellow-300", bg: "bg-yellow-100 dark:bg-[#1c1c2e]",  border: "border-yellow-500 dark:border-yellow-700/60" },
  abbau:         { label: "Abbau",         color: "text-purple-700 dark:text-purple-300", bg: "bg-purple-100 dark:bg-[#1c1c2e]",  border: "border-purple-400 dark:border-purple-800/60" },
  pause:         { label: "Pause",         color: "text-gray-600 dark:text-gray-400",     bg: "bg-gray-100 dark:bg-[#1c1c2e]",    border: "border-gray-400 dark:border-gray-700/60"     },
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
function InstallBanner() {
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = (navigator as any).standalone === true || window.matchMedia("(display-mode: standalone)").matches;
    setIsIOS(ios);
    setShow(!standalone);
  }, []);

  if (!show) return null;

  return (
    <div className="mt-4 bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-sm text-indigo-100 text-center">
      {isIOS ? (
        <>📲 Tippe auf <strong>Teilen</strong> → <strong>„Zum Home-Bildschirm"</strong> um EquiPlan wie eine App zu installieren.</>
      ) : (
        <>📲 Tippe auf das Menü deines Browsers → <strong>„App installieren"</strong> um EquiPlan auf dem Homescreen zu speichern.</>
      )}
    </div>
  );
}

function LoginForm({ onLogin }: { onLogin: (s: AppSession) => void }) {
  const [screen, setScreen] = useState<"welcome" | "login" | "contact">("welcome");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      if (res.ok) {
        const data = await res.json();
        onLogin({ role: data.role, teamId: data.teamId, teamName: data.teamName, speakerId: data.speakerId, speakerName: data.speakerName, speakerRole: data.speakerRole, speakerColor: data.speakerColor, adminName: data.adminName, adminTournamentId: data.adminTournamentId });
      } else if (res.status === 401 || res.status === 403) {
        setError("Passwort nicht erkannt. Bitte prüfe deine Eingabe.");
      } else {
        setError("Server-Fehler. Bitte versuche es später erneut.");
      }
    } catch {
      setError("Keine Verbindung. Prüfe deine Internetverbindung.");
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-800 flex flex-col items-center justify-center overflow-hidden touch-none select-none" style={{padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)", paddingLeft: "max(1.5rem, env(safe-area-inset-left))", paddingRight: "max(1.5rem, env(safe-area-inset-right))"}}>
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
                <h1 className="text-5xl font-bold text-white tracking-tight" data-no-translate>
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
            <InstallBanner />
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
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100" data-no-translate>
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
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5">
                    Dein persönliches Passwort erhältst du vom Veranstalter. Damit wirst du automatisch als Helfer, Team, Sprecher oder Admin erkannt.
                  </p>
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

function isEntryLive(entry: ScheduleEntry): boolean {
  const now = new Date();
  const start = new Date(`${entry.date}T${entry.start_time}:00`);
  const end = new Date(`${entry.date}T${entry.end_time}:00`);
  return start <= now && now <= end;
}

// Lesbare Textfarbe (schwarz/weiß) für einen beliebigen Hex-Hintergrund
function readableTextColor(hex: string): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map(c => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // relative Helligkeit (YIQ)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#1f2937" : "#ffffff";
}

// Liste der Turniertage als Datum-Strings (start..end inklusiv)
function tournamentDays(start?: string, end?: string): string[] {
  if (!start) return [];
  const last = end && end >= start ? end : start;
  const days: string[] = [];
  let d = start;
  for (let i = 0; i < 60 && d <= last; i++) { days.push(d); d = addDays(d, 1); }
  return days;
}

const LiveBadge = () => (
  <span className="ml-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-red-600 text-white align-middle">
    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Jetzt
  </span>
);

function EntryCard({ entry, myTeamId, session }: { entry: ScheduleEntry; myTeamId?: number; session?: AppSession | null }) {
  const [open, setOpen] = useState(false);
  const delays = useContext(DelayContext);
  // Einzel-Verspätung (am Eintrag) hat Vorrang vor Platz-/Tages-Verspätung
  const entryDelay = entry.delay_minutes ?? 0;
  const delayMin = entryDelay > 0 ? entryDelay : effectiveDelay(delays, entry.arena_id);
  const singleEvent = entryDelay > 0;
  // Anzeige-Zeiten inkl. Verspätung
  const dispStart = delayMin ? addMinutesToTime(entry.start_time, delayMin) : entry.start_time;
  const dispEnd = delayMin ? addMinutesToTime(entry.end_time, delayMin) : entry.end_time;
  const effEntry = delayMin ? { ...entry, start_time: dispStart, end_time: dispEnd } : entry;
  const done = isEntryDone(effEntry);
  const live = !done && isEntryLive(effEntry);
  const isMyTeam = myTeamId != null && entry.teams?.some(t => t.id === myTeamId);
  const phase = PHASE_CONFIG[entry.phase] ?? PHASE_CONFIG.pause;
  const { overrides } = useContext(PhaseOverridesContext);
  const overrideColor = overrides[entry.phase];
  const txtColor = overrideColor ? readableTextColor(overrideColor) : undefined;
  const liveRing = live ? "ring-2 ring-red-400 dark:ring-red-500/70 shadow-md" : "";

  // Kennzeichnung der Verspätung (einzeln = orange „nur dieser", sonst rot)
  const delayBadge = delayMin > 0 ? (
    <span className={`ml-1 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold align-middle ${singleEvent ? "bg-amber-500 text-white" : "bg-red-600 text-white"}`}>
      ⏱ +{delayMin}′{singleEvent ? " · nur dieser" : ""}
    </span>
  ) : null;

  // Zeit-Anzeige: bei Verspätung neue Zeit + durchgestrichene Originalzeit
  const timeDisplay = (className?: string, style?: React.CSSProperties) =>
    delayMin ? (
      <span className={className} style={style}>
        <span className="line-through opacity-50 mr-1">{entry.start_time}</span>
        <span className="text-red-600 dark:text-red-400 font-semibold">{dispStart}–{dispEnd}</span>
      </span>
    ) : (
      <span className={className} style={style}>{entry.start_time}–{entry.end_time}</span>
    );

  const cardContent = (
    <>
      {done ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#1c1c2e] p-3 opacity-50 space-y-1 cursor-pointer hover:opacity-70 transition-opacity">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-semibold text-gray-400 dark:text-gray-500 line-through">
                {entry.pruefungs_id && <span className="font-normal mr-1">{entry.pruefungs_id}</span>}
                {entry.title}
              </span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium text-gray-400 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600">
                {phase.label} · Abgeschlossen
              </span>
            </div>
            {timeDisplay("text-sm font-mono text-gray-400 dark:text-gray-500 whitespace-nowrap")}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-400 dark:text-gray-500">
            {entry.arena_name && <span className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">📍 {entry.arena_name}</span>}
            {entry.teams?.map(t => <span key={t.id} className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">👥 {t.name}</span>)}
          </div>
        </div>
      ) : isMyTeam ? (
        <div className={`rounded-xl border-l-4 border-violet-500 bg-violet-50 dark:bg-[#1c1c2e] p-3 space-y-1 shadow-md cursor-pointer hover:brightness-95 transition ${live ? "ring-2 ring-red-400 dark:ring-red-500/70" : "ring-2 ring-violet-300 dark:ring-violet-800"}`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-bold text-violet-900 dark:text-violet-300">
                {entry.pruefungs_id && <span className="text-violet-400 dark:text-violet-500 font-normal mr-1">{entry.pruefungs_id}</span>}
                {entry.title}
              </span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white dark:bg-gray-700 border ${phase.border}`}>{phase.label}</span>
              <span className="ml-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-violet-600 text-white">Ihr Einsatz</span>
              {live && <LiveBadge />}
              {delayBadge}
            </div>
            {timeDisplay("text-sm font-mono font-bold text-violet-700 dark:text-violet-400 whitespace-nowrap")}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {entry.arena_name && <span className="bg-white dark:bg-gray-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 rounded px-2 py-0.5 text-violet-700">📍 {entry.arena_name}</span>}
            {entry.teams?.map(t => (
              <span key={t.id} className={`rounded px-2 py-0.5 border ${t.id === myTeamId ? "bg-violet-600 text-white border-violet-600 font-semibold" : "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-200"}`}>
                👥 {t.name}
              </span>
            ))}
            {entry.speaker_name && (
              <span className="rounded px-2 py-0.5 text-white text-xs" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
                🎙 {entry.speaker_name}{entry.speaker_role ? ` (${entry.speaker_role})` : ""}
              </span>
            )}
          </div>
          {entry.notes && <p className="text-xs text-violet-700 dark:text-violet-400 mt-1 italic">{entry.notes}</p>}
        </div>
      ) : (
        <div className={`rounded-xl border-l-4 ${phase.border} ${phase.bg} ${liveRing} p-3 space-y-1 cursor-pointer hover:brightness-95 transition`} style={overrideColor ? { backgroundColor: overrideColor, borderLeftColor: overrideColor } : undefined}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-semibold text-gray-800 dark:text-gray-100" style={txtColor ? { color: txtColor } : undefined}>
                {entry.pruefungs_id && <span className="text-gray-400 dark:text-gray-500 font-normal mr-1" style={txtColor ? { color: txtColor, opacity: 0.7 } : undefined}>{entry.pruefungs_id}</span>}
                {entry.title}
              </span>
              <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white dark:bg-gray-700 border ${phase.border}`}>{phase.label}</span>
              {live && <LiveBadge />}
              {delayBadge}
            </div>
            {timeDisplay("text-sm font-mono text-gray-500 dark:text-gray-400 whitespace-nowrap", txtColor ? { color: txtColor } : undefined)}
          </div>
          <div className="flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300">
            {entry.arena_name && <span className="bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">📍 {entry.arena_name}</span>}
            {entry.teams?.map(t => <span key={t.id} className="bg-white dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5">👥 {t.name}</span>)}
            {entry.speaker_name && (
              <span className="rounded px-2 py-0.5 text-white text-xs" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
                🎙 {entry.speaker_name}{entry.speaker_role ? ` (${entry.speaker_role})` : ""}
              </span>
            )}
          </div>
          {entry.external_source && <span className="text-xs bg-gray-100 dark:bg-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 text-gray-400">via {entry.external_source}</span>}
          {entry.notes && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic" style={txtColor ? { color: txtColor, opacity: 0.85 } : undefined}>{entry.notes}</p>}
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
  const [entryDelay, setEntryDelay] = useState(entry.delay_minutes ?? 0);
  const [savingDelay, setSavingDelay] = useState(false);

  async function saveEntryDelay(minutes: number) {
    const m = Math.max(0, minutes);
    setSavingDelay(true);
    setEntryDelay(m);
    await fetch(`/api/schedule/${entry.id}/delay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ minutes: m }),
    });
    setSavingDelay(false);
  }

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
        <div className={`p-4 border-b border-gray-200 dark:border-gray-700 ${phase.bg} dark:bg-[#1c1c2e]`}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${phase.color} bg-white dark:bg-gray-700 border ${phase.border} mr-2`}>{phase.label}</span>
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
            {entry.arena_name && <span className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1">📍 {entry.arena_name}</span>}
            {entry.teams?.map(t => <span key={t.id} className="bg-gray-100 dark:bg-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-1">👥 {t.name}</span>)}
            {entry.speaker_name && (
              <span className="rounded-lg px-3 py-1 text-white text-sm" style={{ backgroundColor: entry.speaker_color || "#6B7280" }}>
                🎙 {entry.speaker_name} {entry.speaker_role && `(${entry.speaker_role})`}
              </span>
            )}
          </div>
          {entry.notes && <p className="text-sm text-gray-600 dark:text-gray-400 italic bg-gray-50 dark:bg-gray-800 rounded-lg p-3">{entry.notes}</p>}
          {entry.external_source && <p className="text-xs text-gray-400">Quelle: {entry.external_source}</p>}

          {/* Einzel-Verspätung (Admin) */}
          {session?.role === "admin" && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">⏱ Verspätung – nur dieser Programmpunkt</h3>
                <span className={`text-sm font-mono ${entryDelay ? "text-red-600 dark:text-red-400 font-bold" : "text-gray-400"}`}>
                  {entryDelay ? `+${entryDelay} Min` : "pünktlich"}
                </span>
              </div>
              <div className="flex gap-1 flex-wrap">
                {[5, 10, 15].map(step => (
                  <button key={step} disabled={savingDelay} onClick={() => saveEntryDelay(entryDelay + step)}
                    className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800 text-gray-700 dark:text-gray-200 hover:bg-amber-100 dark:hover:bg-gray-600 disabled:opacity-50">
                    +{step}
                  </button>
                ))}
                <button disabled={savingDelay || entryDelay === 0} onClick={() => saveEntryDelay(entryDelay - 5)}
                  className="text-xs px-2.5 py-1 rounded-md bg-white dark:bg-gray-700 border border-amber-200 dark:border-amber-800 text-gray-700 dark:text-gray-200 hover:bg-amber-100 disabled:opacity-40">
                  −5
                </button>
                <button disabled={savingDelay || entryDelay === 0} onClick={() => saveEntryDelay(0)}
                  className="text-xs px-2.5 py-1 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-40">
                  Zurücksetzen
                </button>
              </div>
              <p className="text-[11px] text-amber-700/70 dark:text-amber-400/60">Überschreibt die Platz-/Tages-Verspätung für diesen einen Eintrag. Zugewiesene Teams werden benachrichtigt.</p>
            </div>
          )}
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
  const { lang, setLang } = useLang();
  const [session, setSession] = useState<AppSession | null>(null);
  const [checking, setChecking] = useState(true);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [activeTournament, setActiveTournament] = useState<Tournament | null>(null);
  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [selectedDate, setSelectedDate] = useState(today());
  const [pushEnabled, setPushEnabled] = useState(false);
  const [phaseOverrides, setPhaseOverrides] = useState<Record<string, string>>({});
  const [delays, setDelays] = useState<Record<number, number>>({});

  useEffect(() => {
    fetch("/api/phases").then(r => r.json()).then(d => { if (d?.overrides) setPhaseOverrides(d.overrides); }).catch(() => {});
  }, []);

  // Service Worker registrieren (Offline-Cache + Push)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && "PushManager" in window) {
      navigator.serviceWorker.ready.then(reg => {
        reg.pushManager.getSubscription().then(sub => {
          if (sub) setPushEnabled(true);
        });
      }).catch(() => {});
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<AppView>("tournament-select");
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const activeTournamentRef = useRef<Tournament | null>(null);

  useEffect(() => {
    fetch("/api/session").then(async r => {
      if (r.ok) {
        const s = await r.json();
        if (s?.role) setSession(s);
      }
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const loadTournaments = useCallback(async () => {
    const res = await fetch("/api/tournaments");
    if (res.ok) setTournaments(await res.json());
  }, []);

  const loadDelays = useCallback(async (tournamentId: number, date: string) => {
    try {
      const res = await fetch(`/api/delays?tournament_id=${tournamentId}&date=${date}`);
      if (res.ok) {
        const rows = (await res.json()) as { arena_id: number; minutes: number }[];
        const map: Record<number, number> = {};
        for (const r of rows) map[r.arena_id] = r.minutes;
        setDelays(map);
      }
    } catch { /* offline – behalte alte Werte */ }
  }, []);

  const loadEntries = useCallback(async (tournamentId: number, date: string) => {
    setLoading(true);
    const res = await fetch(`/api/schedule?tournament_id=${tournamentId}&date=${date}`);
    if (res.ok) setEntries(await res.json());
    loadDelays(tournamentId, date);
    setLoading(false);
  }, [loadDelays]);

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

  // SSE: sofortige Live-Updates wenn der Server Änderungen broadcastet
  useEffect(() => {
    if (!session) return;
    let es: EventSource | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/events");
      es.addEventListener("update", () => {
        if (activeTournamentRef.current) loadEntries(activeTournamentRef.current.id, selectedDate);
      });
      es.onerror = () => {
        es?.close();
        // Reconnect nach 3s
        retryTimeout = setTimeout(connect, 3_000);
      };
    }
    connect();

    // Fallback-Polling alle 30s (falls SSE durch Proxy blockiert)
    const interval = setInterval(() => {
      if (activeTournamentRef.current) loadEntries(activeTournamentRef.current.id, selectedDate);
    }, 30_000);
    const onVisible = () => { if (!document.hidden && activeTournamentRef.current) loadEntries(activeTournamentRef.current.id, selectedDate); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      es?.close();
      clearTimeout(retryTimeout);
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [session, selectedDate, loadEntries]);

  async function handleLogin(s: AppSession) {
    setSession(s);
    // Show-Admin: direkt zum eigenen Turnier
    if (s.role === "admin" && s.adminTournamentId) {
      const res = await fetch("/api/tournaments");
      if (res.ok) {
        const all: Tournament[] = await res.json();
        setTournaments(all);
        const mine = all.find(t => t.id === s.adminTournamentId);
        if (mine) { if (mine.start_date) setSelectedDate(mine.start_date); setActiveTournament(mine); }
      }
    }
    const seen = localStorage.getItem(ONBOARDING_KEY + "-" + s.role);
    if (!seen) setShowOnboarding(true);
    // Push automatisch aktivieren
    try {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        await registerPush();
        setPushEnabled(true);
      }
    } catch { /* Push nicht verfügbar */ }
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
    return <TournamentSelect tournaments={tournaments} session={session} onSelect={t => { if (t.start_date) setSelectedDate(t.start_date); setActiveTournament(t); }} onLogout={handleLogout} onCreated={loadTournaments} />;
  }

  return (
    <PhaseOverridesContext.Provider value={{ overrides: phaseOverrides, setOverrides: setPhaseOverrides }}>
    <DelayContext.Provider value={delays}>
    <div className="fixed inset-0 flex flex-col bg-gray-50 dark:bg-gray-950 overflow-hidden">
      {showOnboarding && session && (
        <OnboardingOverlay session={session} onDone={() => setShowOnboarding(false)} />
      )}
      {showInfo && activeTournament && (
        <InfoModal tournamentId={activeTournament.id} onClose={() => setShowInfo(false)} />
      )}
      <header className="shrink-0 bg-gradient-to-r from-indigo-800 to-violet-700 text-white shadow-lg safe-top">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {activeTournament.logo_path
              ? <img src={activeTournament.logo_path} alt={activeTournament.name} className="w-9 h-9 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
              : <img src="/logo.png" alt="EquiPlan" className="w-9 h-9 object-contain rounded-lg bg-white/10 p-0.5 shrink-0" />
            }
            <div className="min-w-0">
              <h1 className="font-bold text-lg leading-tight tracking-tight" data-no-translate>
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
            <button onClick={togglePush} className="p-2 rounded-lg hover:bg-indigo-700 transition" title={pushEnabled ? "Benachrichtigungen aktiv" : "Benachrichtigungen aktivieren"} aria-label={pushEnabled ? "Benachrichtigungen aktiv" : "Benachrichtigungen aktivieren"}>
              {pushEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            </button>
            <button onClick={() => setShowInfo(true)} className="p-2 rounded-lg hover:bg-indigo-700 transition" title="Infos: Telefonliste & Dokumente" aria-label="Infos">
              <Info size={18} />
            </button>
            <button onClick={() => activeTournament && loadEntries(activeTournament.id, selectedDate)} className="p-2 rounded-lg hover:bg-indigo-700 transition" title="Aktualisieren" aria-label="Aktualisieren">
              <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
            </button>
            {session?.role === "admin" && (
              <button onClick={() => setView(v => v === "admin" ? "schedule" : "admin")}
                className={`p-2 rounded-lg transition ${view === "admin" ? "bg-indigo-500" : "hover:bg-indigo-700"}`}
                title={view === "admin" ? "Zum Zeitplan" : "Verwaltung öffnen"} aria-label={view === "admin" ? "Zum Zeitplan" : "Verwaltung öffnen"}>
                <Settings size={18} />
              </button>
            )}
            <button onClick={() => setLang(lang === "de" ? "en" : "de")} data-no-translate
              className="px-2 py-2 rounded-lg hover:bg-indigo-700 transition text-xs font-bold tracking-wide"
              title={lang === "de" ? "Switch to English" : "Auf Deutsch umschalten"} aria-label="Language">
              {lang === "de" ? "EN" : "DE"}
            </button>
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-indigo-700 transition" title={theme === "dark" ? "Hellmodus" : "Dunkelmodus"} aria-label={theme === "dark" ? "Hellmodus" : "Dunkelmodus"}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <button onClick={handleLogout} className="p-2 rounded-lg hover:bg-indigo-700 transition" title="Abmelden" aria-label="Abmelden"><LogOut size={18} /></button>
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
          {view === "schedule" && <ScheduleTab entries={entries} selectedDate={selectedDate} setSelectedDate={setSelectedDate} session={session} onRefresh={() => loadEntries(activeTournament.id, selectedDate)} activeTournamentId={activeTournament.id} tournament={activeTournament} delays={delays} onDelaysChanged={() => loadDelays(activeTournament.id, selectedDate)} />}
          {view === "admin" && <AdminTab onRefresh={() => loadEntries(activeTournament.id, selectedDate)} activeTournamentId={activeTournament.id} session={session} />}
        </div>
      </main>
    </div>
    </DelayContext.Provider>
    </PhaseOverridesContext.Provider>
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
          <h1 className="text-3xl font-bold text-white" data-no-translate><span>Equi</span><span className="text-violet-300">Plan</span></h1>
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
                  <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 group-hover:scale-105 transition-transform">
                    {t.logo_path
                      ? <img src={t.logo_path} alt={t.name} className="w-full h-full object-contain bg-indigo-50 dark:bg-indigo-900/30" />
                      : <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center"><Trophy size={18} className="text-white" /></div>
                    }
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
  aufbau:       { bg: "bg-orange-100 dark:bg-orange-900/40",  border: "border-orange-400",                          text: "text-orange-800 dark:text-orange-200" },
  wettkampf:    { bg: "bg-blue-100 dark:bg-blue-900/40",      border: "border-blue-400",                            text: "text-blue-800 dark:text-blue-200" },
  siegerehrung: { bg: "bg-yellow-100 dark:bg-yellow-900/40",  border: "border-yellow-500",                          text: "text-yellow-800 dark:text-yellow-200" },
  abbau:        { bg: "bg-purple-100 dark:bg-purple-900/40",  border: "border-purple-400",                          text: "text-purple-800 dark:text-purple-200" },
  pause:        { bg: "bg-gray-100 dark:bg-gray-700",         border: "border-gray-300 dark:border-gray-500",       text: "text-gray-600 dark:text-gray-300" },
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

function ScheduleTab({ entries, selectedDate, setSelectedDate, session, onRefresh, activeTournamentId, tournament, delays, onDelaysChanged }: {
  entries: ScheduleEntry[]; selectedDate: string; setSelectedDate: (d: string) => void; session: AppSession | null; onRefresh: () => void; activeTournamentId?: number; tournament?: Tournament | null; delays: Record<number, number>; onDelaysChanged: () => void;
}) {
  void onRefresh;
  const isAdmin = session?.role === "admin";
  const [viewMode, setViewMode] = useState<"list" | "timeline">("list");
  const canFilterOwn = session?.role === "team" || session?.role === "speaker";
  const [showOnlyMine, setShowOnlyMine] = useState(canFilterOwn);
  const [search, setSearch] = useState("");
  const [arenaFilter, setArenaFilter] = useState<number | "all">("all");
  const [showDelayPanel, setShowDelayPanel] = useState(false);

  const days = tournamentDays(tournament?.start_date, tournament?.end_date);
  const todayStr = today();

  // Plätze, die an diesem Tag tatsächlich Einträge haben
  const arenasToday = (() => {
    const map = new Map<number, string>();
    for (const e of entries) if (e.arena_id) map.set(e.arena_id, e.arena_name ?? `Platz ${e.arena_id}`);
    return Array.from(map, ([id, name]) => ({ id, name }));
  })();

  // Konflikte erkennen (nur für Admins relevant): gleicher Platz + Zeitüberlappung,
  // oder dasselbe Team in zwei sich überlappenden Einträgen.
  const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const conflictIds = new Set<number>();
  if (isAdmin) {
    // Nur echte Platz-Überschneidungen (gleicher Platz, gleiche Zeit).
    // Gleiche Teamnamen sind KEIN Konflikt – große Teams teilen sich selbst auf.
    // "Pause" zählt nicht als Belegung – dort passiert nichts, also kein Konflikt.
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const a = entries[i], b = entries[j];
        if (!a.arena_id || !b.arena_id || a.arena_id !== b.arena_id) continue;
        if (a.phase === "pause" || b.phase === "pause") continue;
        const overlap = toMin(a.start_time) < toMin(b.end_time) && toMin(b.start_time) < toMin(a.end_time);
        if (overlap) { conflictIds.add(a.id); conflictIds.add(b.id); }
      }
    }
  }

  const ownFiltered = showOnlyMine && canFilterOwn
    ? entries.filter(e => {
        if (session?.role === "team") return e.teams.some(t => t.id === session.teamId);
        if (session?.role === "speaker") return e.speaker_id === session.speakerId;
        return true;
      })
    : entries;

  const q = search.trim().toLowerCase();
  const filteredEntries = ownFiltered.filter(e => {
    if (arenaFilter !== "all" && e.arena_id !== arenaFilter) return false;
    if (q) {
      const hay = `${e.title} ${e.pruefungs_id ?? ""} ${e.arena_name ?? ""} ${e.speaker_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  // Auto-Scroll zum aktuell laufenden Eintrag
  const liveRef = useRef<HTMLDivElement | null>(null);
  const liveEntryId = (() => {
    for (const e of filteredEntries) {
      const dly = effectiveDelay(delays, e.arena_id);
      const eff = dly ? { ...e, start_time: addMinutesToTime(e.start_time, dly), end_time: addMinutesToTime(e.end_time, dly) } : e;
      if (!isEntryDone(eff) && isEntryLive(eff)) return e.id;
    }
    return null;
  })();
  useEffect(() => {
    if (liveRef.current) liveRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [liveEntryId, viewMode]);

  const myTeamId = session?.teamId;
  const globalDelay = delays[0] ?? 0;
  return (
    <div>
      {/* Turniertag-Tabs */}
      {days.length > 1 && (
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 -mx-1 px-1">
          {days.map((d, i) => {
            const active = d === selectedDate;
            const isToday = d === todayStr;
            const dd = new Date(d + "T00:00:00");
            return (
              <button
                key={d}
                onClick={() => setSelectedDate(d)}
                className={`shrink-0 px-3 py-2 rounded-xl border text-center transition ${
                  active
                    ? "bg-indigo-600 text-white border-indigo-600 shadow"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-80 leading-none">
                  {dd.toLocaleDateString("de-DE", { weekday: "short" })}
                </div>
                <div className="text-sm font-bold leading-tight mt-0.5">
                  Tag {i + 1}
                </div>
                <div className={`text-[10px] leading-none mt-0.5 ${active ? "text-indigo-100" : "text-gray-400 dark:text-gray-500"}`}>
                  {dd.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                  {isToday && <span className={`ml-1 ${active ? "text-white" : "text-red-500"}`}>● heute</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

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

        {arenasToday.length > 1 && (
          <select
            value={arenaFilter}
            onChange={e => setArenaFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium border bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700"
          >
            <option value="all">📍 Alle Plätze</option>
            {arenasToday.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}

        {isAdmin && (
          <button
            onClick={() => setShowDelayPanel(v => !v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
              globalDelay || Object.keys(delays).length
                ? "bg-red-600 text-white border-red-600"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            }`}
          >
            ⏱ Verspätung{globalDelay ? ` +${globalDelay}′` : ""}
          </button>
        )}

        {/* Suche */}
        <div className="flex-1 min-w-[140px]">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Suchen (Titel, ID, Platz…)"
            className="w-full px-3 py-1.5 rounded-lg text-sm border bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Verspätungs-Panel (Admin) */}
      {isAdmin && showDelayPanel && activeTournamentId && (
        <DelayPanel
          tournamentId={activeTournamentId}
          date={selectedDate}
          arenas={arenasToday}
          delays={delays}
          onChanged={onDelaysChanged}
        />
      )}

      {/* Konflikt-Warnung (Admin) */}
      {isAdmin && conflictIds.size > 0 && (
        <div className="mb-4 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl px-4 py-2.5 text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
          <span className="text-base">⚠️</span>
          <span><strong>{conflictIds.size} Einträge</strong> mit Platz-Überschneidung (gleicher Platz zur gleichen Zeit).</span>
        </div>
      )}

      {filteredEntries.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">📋</div>
          <p>{showOnlyMine && canFilterOwn ? "Keine eigenen Einsätze für diesen Tag." : "Keine Einträge für diesen Tag."}</p>
          {session?.role === "admin" && <p className="text-sm mt-1">Im ⚙️ Admin-Bereich Einträge anlegen.</p>}
          {session?.role === "team" && showOnlyMine && <p className="text-sm mt-1 text-violet-600">Heute keine Einsätze für {session.teamName}.</p>}
        </div>
      ) : viewMode === "list" ? (
        <div className="space-y-2">
          {filteredEntries.map(e => (
            <div
              key={e.id}
              ref={e.id === liveEntryId ? liveRef : undefined}
              className={conflictIds.has(e.id) ? "rounded-xl outline-dashed outline-2 outline-amber-500/70 outline-offset-1" : ""}
            >
              <EntryCard entry={e} myTeamId={myTeamId} session={session} />
            </div>
          ))}
        </div>
      ) : (
        <TimelineView entries={filteredEntries} selectedDate={selectedDate} session={session} />
      )}
    </div>
  );
}

// Admin-Panel zum Setzen von Verspätungen (ganzer Tag + pro Platz)
function DelayPanel({ tournamentId, date, arenas, delays, onChanged }: {
  tournamentId: number; date: string; arenas: { id: number; name: string }[]; delays: Record<number, number>; onChanged: () => void;
}) {
  const [saving, setSaving] = useState<number | null>(null);

  async function setDelay(arenaId: number, minutes: number) {
    setSaving(arenaId);
    await fetch("/api/delays", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tournament_id: tournamentId, date, arena_id: arenaId, minutes: Math.max(0, minutes) }),
    });
    onChanged();
    setSaving(null);
  }

  const renderRow = (id: number, name: string) => {
    const cur = delays[id] ?? 0;
    return (
      <div key={id} className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200 w-32 shrink-0">{name}</span>
        <span className={`text-sm font-mono w-16 ${cur ? "text-red-600 dark:text-red-400 font-bold" : "text-gray-400"}`}>
          {cur ? `+${cur} Min` : "pünktl."}
        </span>
        <div className="flex gap-1">
          {[5, 10, 15].map(step => (
            <button key={step} disabled={saving === id} onClick={() => setDelay(id, cur + step)}
              className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50">
              +{step}
            </button>
          ))}
          <button disabled={saving === id || cur === 0} onClick={() => setDelay(id, Math.max(0, cur - 5))}
            className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40">
            −5
          </button>
          <button disabled={saving === id || cur === 0} onClick={() => setDelay(id, 0)}
            className="text-xs px-2 py-1 rounded-md bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 hover:bg-red-200 disabled:opacity-40">
            Zurücksetzen
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="mb-4 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800/60 rounded-xl p-4 space-y-3 shadow-sm">
      <div>
        <h3 className="font-semibold text-gray-800 dark:text-gray-100 text-sm">⏱ Verspätung anpassen</h3>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Verschiebt die angezeigten Zeiten live für alle. Original bleibt durchgestrichen sichtbar.</p>
      </div>
      {renderRow(0, "Ganzer Tag")}
      {arenas.length > 0 && (
        <div className="border-t border-gray-100 dark:border-gray-700 pt-3 space-y-2">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Einzelne Plätze (überschreiben den ganzen Tag)</p>
          {arenas.map(a => renderRow(a.id, a.name))}
        </div>
      )}
    </div>
  );
}

type AdminMainTab = "zeitplan" | "turnier" | "verwaltung";
type ZeitplanSub = "entries" | "shifts";
type TurnierSub = "details" | "organisation" | "phasen" | "kontakte" | "dokumente" | "share";
type VerwaltungSub = "settings" | "api" | "inquiries" | "admins";

function AdminTab({ onRefresh, activeTournamentId, session }: { onRefresh: () => void; activeTournamentId?: number; session: AppSession | null }) {
  const isSuperAdmin = !session?.adminTournamentId;
  const [main, setMain] = useState<AdminMainTab>("zeitplan");
  const [zeitplanSub, setZeitplanSub] = useState<ZeitplanSub>("entries");
  const [turnierSub, setTurnierSub] = useState<TurnierSub>("details");
  const [verwaltungSub, setVerwaltungSub] = useState<VerwaltungSub>("settings");

  const [entries, setEntries] = useState<ScheduleEntry[]>([]);
  const [speakers, setSpeakers] = useState<Speaker[]>([]);
  const [arenas, setArenas] = useState<Arena[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [editEntry, setEditEntry] = useState<Partial<ScheduleEntry> | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(today());
  const [tournament, setTournament] = useState<Tournament | null>(null);

  useEffect(() => {
    if (activeTournamentId) fetch(`/api/tournaments/${activeTournamentId}`).then(r => r.json()).then(setTournament);
  }, [activeTournamentId]);

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
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(`Speichern fehlgeschlagen: ${d.error || res.statusText}`);
      return;
    }
    setShowForm(false); setEditEntry(null);
    load(); onRefresh();
  }

  async function deleteEntry(id: number) {
    if (!confirm("Eintrag wirklich löschen?")) return;
    await fetch(`/api/schedule/${id}`, { method: "DELETE" });
    load(); onRefresh();
  }

  const mainBtnCls = (key: AdminMainTab) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition ${main === key ? "bg-indigo-600 text-white shadow" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"}`;
  const subBtnCls = (active: boolean) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition ${active ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700" : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700"}`;

  return (
    <div className="space-y-4">
      {/* Haupt-Navigation */}
      <div className="flex gap-2">
        <button className={mainBtnCls("zeitplan")} onClick={() => setMain("zeitplan")}>📅 Zeitplan</button>
        <button className={mainBtnCls("turnier")} onClick={() => setMain("turnier")}>🏆 Turnier</button>
        {isSuperAdmin && <button className={mainBtnCls("verwaltung")} onClick={() => setMain("verwaltung")}>⚙️ Verwaltung</button>}
      </div>

      {/* Sub-Navigation */}
      {main === "zeitplan" && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 pb-3">
          <button className={subBtnCls(zeitplanSub === "entries")} onClick={() => setZeitplanSub("entries")}>Einträge</button>
          <button className={subBtnCls(zeitplanSub === "shifts")} onClick={() => setZeitplanSub("shifts")}>🕐 Schichten</button>
        </div>
      )}
      {main === "turnier" && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 pb-3 flex-wrap">
          <button className={subBtnCls(turnierSub === "details")} onClick={() => setTurnierSub("details")}>Details & Logo</button>
          <button className={subBtnCls(turnierSub === "organisation")} onClick={() => setTurnierSub("organisation")}>Sprecher · Plätze · Teams</button>
          <button className={subBtnCls(turnierSub === "phasen")} onClick={() => setTurnierSub("phasen")}>Phasen</button>
          <button className={subBtnCls(turnierSub === "kontakte")} onClick={() => setTurnierSub("kontakte")}>📞 Telefonliste</button>
          <button className={subBtnCls(turnierSub === "dokumente")} onClick={() => setTurnierSub("dokumente")}>📄 Dokumente</button>
          <button className={subBtnCls(turnierSub === "share")} onClick={() => setTurnierSub("share")}>🔗 Share-Link</button>
        </div>
      )}
      {main === "verwaltung" && isSuperAdmin && (
        <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 pb-3 flex-wrap">
          <button className={subBtnCls(verwaltungSub === "settings")} onClick={() => setVerwaltungSub("settings")}>Passwörter</button>
          <button className={subBtnCls(verwaltungSub === "api")} onClick={() => setVerwaltungSub("api")}>API-Zugang</button>
          <button className={subBtnCls(verwaltungSub === "inquiries")} onClick={() => setVerwaltungSub("inquiries")}>Anfragen</button>
          <button className={subBtnCls(verwaltungSub === "admins")} onClick={() => setVerwaltungSub("admins")}>👥 Admins</button>
        </div>
      )}

      {/* Inhalte */}
      {main === "zeitplan" && zeitplanSub === "entries" && (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
              className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-auto" />
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
      {main === "zeitplan" && zeitplanSub === "shifts" && <ShiftsTab tournamentId={activeTournamentId} tournament={tournament} />}

      {main === "turnier" && turnierSub === "details" && <TournamentSettingsTab tournamentId={activeTournamentId} onLogoUpdated={onRefresh} />}
      {main === "turnier" && turnierSub === "organisation" && <OrganisationTab speakers={speakers} arenas={arenas} teams={teams} onRefresh={load} />}
      {main === "turnier" && turnierSub === "kontakte" && <ContactsTab tournamentId={activeTournamentId} />}
      {main === "turnier" && turnierSub === "phasen" && <PhasesTab />}
      {main === "turnier" && turnierSub === "dokumente" && <DocumentsAdminTab tournamentId={activeTournamentId} isSuperAdmin={isSuperAdmin} />}
      {main === "turnier" && turnierSub === "share" && <ShareTab tournamentId={activeTournamentId} />}

      {main === "verwaltung" && isSuperAdmin && verwaltungSub === "settings" && <PasswordSettings />}
      {main === "verwaltung" && isSuperAdmin && verwaltungSub === "api" && <ApiKeySettings />}
      {main === "verwaltung" && isSuperAdmin && verwaltungSub === "inquiries" && <InquiriesTab />}
      {main === "verwaltung" && isSuperAdmin && verwaltungSub === "admins" && <AdminsTab />}

      {showForm && (
        <EntryForm
          entry={editEntry} speakers={speakers} arenas={arenas} teams={teams}
          onSave={saveEntry} onClose={() => { setShowForm(false); setEditEntry(null); }}
        />
      )}
    </div>
  );
}

const inputClass = "w-full border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-gray-400 dark:placeholder:text-gray-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">{label}</label>{children}</div>;
}

function EntryForm({ entry, speakers, arenas, teams, onSave, onClose }: {
  entry: Partial<ScheduleEntry> | null; speakers: Speaker[]; arenas: Arena[]; teams: Team[];
  onSave: (d: Partial<ScheduleEntry> & { team_ids: number[] }) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<Partial<ScheduleEntry>>(entry ?? { phase: "wettkampf", date: today(), teams: [] });
  const [selectedTeamIds, setSelectedTeamIds] = useState<number[]>(entry?.teams?.map(t => t.id) ?? []);
  const [customPhases, setCustomPhases] = useState<{ key: string; label: string }[]>([]);
  const set = (k: keyof ScheduleEntry, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    fetch("/api/phases").then(r => r.json()).then(d => {
      if (Array.isArray(d)) setCustomPhases(d.map((p: { key: string; label: string }) => ({ key: p.key, label: p.label })));
    });
  }, []);

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
              {customPhases.length > 0 && <optgroup label="Eigene Phasen">
                {customPhases.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
              </optgroup>}
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
              {speakers.map(s => <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ""}</option>)}
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

function OrganisationTab({ speakers, arenas, teams, onRefresh }: { speakers: Speaker[]; arenas: Arena[]; teams: Team[]; onRefresh: () => void }) {
  const [sub, setSub] = useState<"speakers" | "arenas" | "teams">("speakers");
  const s = (key: typeof sub) => `px-3 py-1.5 rounded-lg text-sm font-medium transition ${sub === key ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"}`;
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <button className={s("speakers")} onClick={() => setSub("speakers")}>🎙 Sprecher</button>
        <button className={s("arenas")} onClick={() => setSub("arenas")}>📍 Plätze</button>
        <button className={s("teams")} onClick={() => setSub("teams")}>👥 Teams</button>
      </div>
      {sub === "speakers" && <SpeakersTab speakers={speakers} onRefresh={onRefresh} />}
      {sub === "arenas" && <ArenasTab arenas={arenas} onRefresh={onRefresh} />}
      {sub === "teams" && <TeamsTab teams={teams} onRefresh={onRefresh} />}
    </div>
  );
}

// Telefonliste – Admin-Pflege (pro Turnier)
function ContactsTab({ tournamentId }: { tournamentId?: number }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);

  const load = useCallback(async () => {
    if (!tournamentId) return;
    const r = await fetch(`/api/contacts?tournament_id=${tournamentId}`);
    if (r.ok) setContacts(await r.json());
  }, [tournamentId]);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!edit?.name?.trim()) return;
    const method = edit.id ? "PUT" : "POST";
    await fetch("/api/contacts", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...edit, tournament_id: tournamentId }),
    });
    setEdit(null); load();
  }

  async function del(id: number) {
    if (!confirm("Kontakt löschen?")) return;
    await fetch("/api/contacts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">📞 Telefonliste</h3>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Sichtbar für alle eingeloggten Nutzer dieses Turniers.</p>
        </div>
        <button onClick={() => setEdit({})} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700 shrink-0">+ Hinzufügen</button>
      </div>

      {contacts.length === 0 && <p className="text-sm text-gray-400">Noch keine Kontakte angelegt.</p>}

      {contacts.map(c => (
        <div key={c.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-800 dark:text-gray-100 break-words">{c.name}{c.role && <span className="font-normal text-gray-500 dark:text-gray-400"> · {c.role}</span>}</p>
            {c.phone && <p className="text-xs text-indigo-600 dark:text-indigo-400 font-mono break-words">{c.phone}</p>}
          </div>
          <button onClick={() => setEdit({ ...c })} className="text-xs text-blue-600 hover:underline mr-2 shrink-0">Bearbeiten</button>
          <button onClick={() => del(c.id)} className="text-xs text-red-500 hover:underline shrink-0">Löschen</button>
        </div>
      ))}

      {edit !== null && (
        <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <Field label="Name"><input value={edit.name ?? ""} onChange={e => setEdit(v => ({ ...v!, name: e.target.value }))} className={inputClass} placeholder="z.B. Maria Müller" autoFocus /></Field>
          <Field label="Rolle / Job"><input value={edit.role ?? ""} onChange={e => setEdit(v => ({ ...v!, role: e.target.value }))} className={inputClass} placeholder="z.B. Turnierleitung, Sanitäter, Parkplatz" /></Field>
          <Field label="Telefonnummer"><input type="tel" value={edit.phone ?? ""} onChange={e => setEdit(v => ({ ...v!, phone: e.target.value }))} className={inputClass} placeholder="z.B. +49 170 1234567" /></Field>
          <div className="flex gap-2">
            <button onClick={save} disabled={!edit.name?.trim()} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">Speichern</button>
            <button onClick={() => setEdit(null)} className="border border-gray-300 dark:border-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 dark:text-gray-200">Abbrechen</button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CustomPhase { id: number; key: string; label: string; color: string; }

const PHASE_COLORS = [
  { label: "Indigo",  value: "#6366f1" },
  { label: "Violett", value: "#8b5cf6" },
  { label: "Rose",    value: "#f43f5e" },
  { label: "Türkis",  value: "#14b8a6" },
  { label: "Grün",    value: "#22c55e" },
  { label: "Amber",   value: "#f59e0b" },
  { label: "Cyan",    value: "#06b6d4" },
  { label: "Pink",    value: "#ec4899" },
];

// Standard-Phase-Defaults (Hex) für den Color-Picker
const PHASE_DEFAULT_COLORS: Record<string, string> = {
  aufbau: "#f97316", wettkampf: "#3b82f6", siegerehrung: "#eab308", abbau: "#a855f7", pause: "#6b7280",
};

function PhasesTab() {
  const [custom, setCustom] = useState<CustomPhase[]>([]);
  const { overrides, setOverrides: setGlobalOverrides } = useContext(PhaseOverridesContext);
  const [newLabel, setNewLabel] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [editingPhase, setEditingPhase] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/phases").then(r => r.json()).then(d => {
      if (d?.custom) setCustom(Array.isArray(d.custom) ? d.custom : []);
      if (d?.overrides) setGlobalOverrides(d.overrides);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveOverride(phaseKey: string, color: string) {
    await fetch("/api/phases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "override", phase: phaseKey, color }) });
    setGlobalOverrides({ ...overrides, [phaseKey]: color });
    setEditingPhase(null);
  }

  async function add() {
    if (!newLabel.trim()) return;
    setSaving(true);
    const r = await fetch("/api/phases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: newLabel, color: newColor }) });
    if (r.ok) { const p = await r.json(); setCustom(c => [...c, p]); setNewLabel(""); }
    else { const d = await r.json(); alert(d.error); }
    setSaving(false);
  }

  async function remove(id: number) {
    await fetch("/api/phases", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    setCustom(c => c.filter(p => p.id !== id));
  }

  return (
    <div className="space-y-5 max-w-lg">
      {/* Standard-Phasen mit Farbwahl */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200">Standard-Phasen</h3>
          <p className="text-xs text-gray-400 mt-0.5">Farbe anpassen, nicht löschbar.</p>
        </div>
        {Object.entries(PHASE_CONFIG).map(([key, v]) => {
          const currentColor = overrides[key] ?? PHASE_DEFAULT_COLORS[key] ?? "#6366f1";
          const isEditing = editingPhase === key;
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: currentColor }} />
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{v.label}</span>
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5 flex-wrap">
                    {PHASE_COLORS.map(c => (
                      <button key={c.value} onClick={() => saveOverride(key, c.value)}
                        className={`w-6 h-6 rounded-full border-2 transition hover:scale-110 ${currentColor === c.value ? "border-gray-800 dark:border-white" : "border-transparent"}`}
                        style={{ backgroundColor: c.value }} title={c.label} />
                    ))}
                  </div>
                  <button onClick={() => setEditingPhase(null)} className="text-xs text-gray-400 hover:text-gray-600 px-1">✕</button>
                </div>
              ) : (
                <button onClick={() => setEditingPhase(key)} className="text-xs text-indigo-500 hover:text-indigo-700 px-2 py-0.5 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/30">Farbe</button>
              )}
            </div>
          );
        })}
      </div>

      {/* Eigene Phasen */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">Eigene Phasen</h3>
        {custom.length === 0 && <p className="text-sm text-gray-400">Noch keine eigenen Phasen.</p>}
        <div className="space-y-2">
          {custom.map(p => (
            <div key={p.id} className="flex items-center gap-3">
              <span className="w-4 h-4 rounded-full shrink-0 border border-gray-200" style={{ backgroundColor: p.color }} />
              <span className="flex-1 text-sm font-medium text-gray-700 dark:text-gray-200">{p.label}</span>
              <span className="text-xs text-gray-400 font-mono">{p.key}</span>
              <button onClick={() => remove(p.id)} className="text-xs text-red-500 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-50">✕</button>
            </div>
          ))}
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
          <h4 className="text-sm font-medium text-gray-600 dark:text-gray-300">Neue Phase anlegen</h4>
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Name (z.B. Vorführung)" className={inputClass} />
          <div className="flex flex-wrap gap-2">
            {PHASE_COLORS.map(c => (
              <button key={c.value} onClick={() => setNewColor(c.value)}
                className={`w-7 h-7 rounded-full border-2 transition ${newColor === c.value ? "border-gray-800 dark:border-white scale-110" : "border-transparent hover:scale-105"}`}
                style={{ backgroundColor: c.value }} title={c.label} />
            ))}
          </div>
          <button onClick={add} disabled={saving || !newLabel.trim()}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
            {saving ? "..." : "+ Phase hinzufügen"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TournamentSettingsTab({ tournamentId, onLogoUpdated }: { tournamentId?: number; onLogoUpdated: () => void }) {
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", start_date: "", end_date: "" });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!tournamentId) return;
    fetch(`/api/tournaments/${tournamentId}`).then(r => r.json()).then((t: Tournament) => {
      setTournament(t);
      setForm({ name: t.name, location: t.location ?? "", start_date: t.start_date ?? "", end_date: t.end_date ?? "" });
    });
  }, [tournamentId]);

  async function uploadLogo(file: File) {
    if (!tournamentId) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("tournament_id", String(tournamentId));
    const r = await fetch("/api/tournaments/logo", { method: "POST", body: fd });
    if (r.ok) {
      const d = await r.json();
      setTournament(t => t ? { ...t, logo_path: d.logo_path } : t);
      onLogoUpdated();
    }
    setUploading(false);
  }

  async function saveTournament() {
    if (!tournamentId || !form.name.trim()) return;
    setSaving(true);
    const r = await fetch(`/api/tournaments/${tournamentId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (r.ok) { const t = await r.json(); setTournament(t); onLogoUpdated(); }
    setSaving(false);
  }

  if (!tournamentId) return <p className="text-gray-400 text-sm">Kein Turnier aktiv.</p>;
  if (!tournament) return <p className="text-gray-400 text-sm">Laden...</p>;

  return (
    <div className="space-y-5 max-w-lg">
      {/* Logo */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-4">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">🖼️ Veranstaltungslogo</h3>
        <p className="text-xs text-gray-400">Wird im Header, in der Turnierauswahl und in allen Exporten (PDF) angezeigt.</p>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-dashed border-gray-200 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-700 shrink-0">
            {tournament.logo_path
              ? <img src={tournament.logo_path} alt="Logo" className="w-full h-full object-contain" />
              : <span className="text-2xl opacity-30">🏆</span>
            }
          </div>
          <div className="flex flex-col gap-2">
            <button onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {uploading ? "Hochladen..." : tournament.logo_path ? "Logo ersetzen" : "Logo hochladen"}
            </button>
            <p className="text-xs text-gray-400">JPG, PNG, WebP · max. 5 MB</p>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
      </div>

      {/* Details */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200">📝 Turnier-Details</h3>
        <div className="space-y-2">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Turniername *" className={inputClass} />
          <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="Ort" className={inputClass} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Startdatum</label>
              <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">Enddatum</label>
              <input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full" />
            </div>
          </div>
        </div>
        <button onClick={saveTournament} disabled={saving || !form.name.trim()}
          className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "Speichern..." : "Änderungen speichern"}
        </button>
      </div>
    </div>
  );
}

function ShareTab({ tournamentId }: { tournamentId?: number }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [copied, setCopied] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    if (!tournamentId) return;
    fetch(`/api/tournaments/${tournamentId}`).then(r => r.ok ? r.json() : null).then(d => {
      setToken(d?.share_token ?? null);
      setStaffToken(d?.staff_token ?? null);
    });
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

  async function generateStaff() {
    if (!tournamentId) return;
    const r = await fetch(`/api/tournaments/${tournamentId}/staff`, { method: "POST" });
    const d = await r.json();
    setStaffToken(d.token);
  }

  async function revokeStaff() {
    if (!tournamentId || !confirm("Internen Staff-Link wirklich deaktivieren?")) return;
    await fetch(`/api/tournaments/${tournamentId}/staff`, { method: "DELETE" });
    setStaffToken(null);
  }

  function copy(url: string, which: string) {
    navigator.clipboard.writeText(url);
    setCopied(which);
    setTimeout(() => setCopied(""), 2000);
  }

  if (!tournamentId) return <p className="text-gray-400 text-sm">Kein Turnier aktiv.</p>;
  if (token === undefined) return <p className="text-gray-400 text-sm">Laden...</p>;

  const shareUrl = token ? `${origin}/share/${token}` : null;
  const staffUrl = staffToken ? `${origin}/share/${staffToken}` : null;

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
                <button onClick={() => copy(shareUrl, "public")} className="shrink-0 text-xs bg-indigo-50 border border-indigo-200 px-3 py-2 rounded-lg hover:bg-indigo-100 font-medium">
                  {copied === "public" ? "✓" : "Kopieren"}
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

      {/* Interner Staff-Link */}
      <div className="bg-white dark:bg-gray-800 border border-amber-200 dark:border-amber-800/60 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <span className="text-lg">🔒</span> Interner Staff-Link
          </h3>
          <p className="text-xs text-gray-400 mt-1">Wie der öffentliche Link, zeigt aber zusätzlich die <strong>Telefonliste</strong>. Für Helfer/Dienstleister ohne Login. Nur an interne Personen weitergeben.</p>
        </div>

        {staffUrl ? (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Aktiver interner Link</label>
              <div className="flex gap-2">
                <code className="flex-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900 rounded-lg px-3 py-2 text-xs font-mono text-amber-800 dark:text-amber-300 break-all">{staffUrl}</code>
                <button onClick={() => copy(staffUrl, "staff")} className="shrink-0 text-xs bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg hover:bg-amber-100 font-medium text-amber-800">
                  {copied === "staff" ? "✓" : "Kopieren"}
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={staffUrl} target="_blank" rel="noopener noreferrer"
                className="flex-1 text-center text-sm bg-amber-600 text-white px-4 py-2 rounded-lg hover:bg-amber-700 font-medium transition">
                Link öffnen →
              </a>
              <button onClick={revokeStaff} className="text-sm bg-red-50 text-red-700 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-100 transition">Deaktivieren</button>
            </div>
          </>
        ) : (
          <div>
            <p className="text-sm text-gray-500 mb-3">Noch kein interner Link aktiv.</p>
            <button onClick={generateStaff} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition">
              Staff-Link generieren
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

// ── Shifts Tab ────────────────────────────────────────────────────────────────
interface Shift {
  id: number; tournament_id?: number; date: string; start_time: string; end_time: string;
  task: string; notes?: string; worker_count: number; attended_count: number;
  assignments: ShiftAssignment[];
}
interface ShiftAssignment {
  id: number; shift_id: number; worker_name: string; attended: number; notes?: string;
}

function ShiftsTab({ tournamentId, tournament }: { tournamentId?: number; tournament?: Tournament | null }) {
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [filterDate, setFilterDate] = useState("");
  const [editShift, setEditShift] = useState<Partial<Shift> | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [newWorker, setNewWorker] = useState<{ [shiftId: number]: string }>({});
  const [view, setView] = useState<"shifts" | "report">("shifts");

  const load = useCallback(async () => {
    let url = "/api/shifts";
    const params = new URLSearchParams();
    if (tournamentId) params.set("tournament_id", String(tournamentId));
    if (filterDate) params.set("date", filterDate);
    if (params.toString()) url += "?" + params.toString();
    const res = await fetch(url);
    if (res.ok) setShifts(await res.json());
  }, [tournamentId, filterDate]);

  useEffect(() => { load(); }, [load]);

  async function saveShift() {
    if (!editShift) return;
    const method = editShift.id ? "PUT" : "POST";
    await fetch("/api/shifts", {
      method, headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...editShift, tournament_id: tournamentId }),
    });
    setEditShift(null); load();
  }

  async function deleteShift(id: number) {
    if (!confirm("Schicht löschen?")) return;
    await fetch("/api/shifts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  async function addWorker(shiftId: number) {
    const name = newWorker[shiftId]?.trim();
    if (!name) return;
    await fetch("/api/shifts/assignments", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shift_id: shiftId, worker_name: name }),
    });
    setNewWorker(v => ({ ...v, [shiftId]: "" }));
    load();
  }

  async function toggleAttended(assignment: ShiftAssignment) {
    const next = assignment.attended === 1 ? 0 : 1;
    await fetch("/api/shifts/assignments", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...assignment, attended: next }),
    });
    load();
  }

  async function removeWorker(id: number) {
    await fetch("/api/shifts/assignments", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    load();
  }

  function totalHours(shifts: Shift[]) {
    const byWorker: { [name: string]: number } = {};
    for (const s of shifts) {
      const [sh, sm] = s.start_time.split(":").map(Number);
      const [eh, em] = s.end_time.split(":").map(Number);
      const hours = (eh * 60 + em - sh * 60 - sm) / 60;
      for (const a of s.assignments) {
        byWorker[a.worker_name] = (byWorker[a.worker_name] ?? 0) + hours;
      }
    }
    return byWorker;
  }

  const workerHours = totalHours(shifts);

  function exportExcel() {
    import("xlsx").then(XLSX => {
      const tournamentHeader = tournament?.name ? [[tournament.name + " – Schichtplan EquiPlan"], [""]] : [];
      // Sheet 1: Schichten-Detail
      const detailRows: any[] = [...tournamentHeader, ["Datum", "Aufgabe", "Von", "Bis", "Stunden", "Mitarbeiter", "Anwesend", "Notizen"]];
      for (const s of shifts) {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const h = (eh * 60 + em - sh * 60 - sm) / 60;
        if (s.assignments.length === 0) {
          detailRows.push([s.date, s.task, s.start_time, s.end_time, h, "—", "—", s.notes ?? ""]);
        } else {
          for (const a of s.assignments) {
            detailRows.push([s.date, s.task, s.start_time, s.end_time, h, a.worker_name, a.attended === 1 ? "Ja" : "Nein", s.notes ?? ""]);
          }
        }
      }
      // Sheet 2: Stunden-Zusammenfassung
      const summaryRows: any[] = [...tournamentHeader, ["Mitarbeiter", "Schichten", "Gesamtstunden", "Anwesend"]];
      const byWorker: { [n: string]: { shifts: number; hours: number; attended: number } } = {};
      for (const s of shifts) {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const h = (eh * 60 + em - sh * 60 - sm) / 60;
        for (const a of s.assignments) {
          if (!byWorker[a.worker_name]) byWorker[a.worker_name] = { shifts: 0, hours: 0, attended: 0 };
          byWorker[a.worker_name].shifts++;
          byWorker[a.worker_name].hours += h;
          if (a.attended === 1) byWorker[a.worker_name].attended++;
        }
      }
      for (const [name, d] of Object.entries(byWorker).sort((a, b) => b[1].hours - a[1].hours)) {
        summaryRows.push([name, d.shifts, parseFloat(d.hours.toFixed(2)), d.attended]);
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailRows), "Schichten");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), "Auswertung");
      const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([wbout], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EquiPlan_Schichten_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
    });
  }

  function exportPDF() {
    import("jspdf").then(async ({ default: jsPDF }) => {
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape" });

      // Header-Gradient
      doc.setFillColor(55, 48, 163);
      doc.rect(0, 0, 297, 22, "F");
      doc.setFillColor(109, 40, 217);
      doc.rect(180, 0, 117, 22, "F");

      // Logo im Header (wenn vorhanden)
      let textStartX = 14;
      if (tournament?.logo_path) {
        try {
          const imgRes = await fetch(tournament.logo_path);
          const imgBlob = await imgRes.blob();
          const imgDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(imgBlob);
          });
          doc.addImage(imgDataUrl, 6, 2, 18, 18);
          textStartX = 28;
        } catch { /* Logo-Ladefehler ignorieren */ }
      }

      // Titelzeile: Turniername (groß) + "Schichtauswertung" (klein, darunter)
      const tournamentName = tournament?.name ?? "EquiPlan";
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(tournamentName, textStartX, 10);
      doc.setTextColor(196, 181, 253);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text("Schichtauswertung", textStartX, 17);
      doc.setTextColor(199, 210, 254);
      doc.text(`Erstellt: ${new Date().toLocaleDateString("de-DE")}`, 238, 14);

      // Zusammenfassung
      doc.setTextColor(0, 0, 0);
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Stunden-Übersicht", 14, 30);

      const byWorker: { [n: string]: { shifts: number; hours: number; attended: number } } = {};
      for (const s of shifts) {
        const [sh, sm] = s.start_time.split(":").map(Number);
        const [eh, em] = s.end_time.split(":").map(Number);
        const h = (eh * 60 + em - sh * 60 - sm) / 60;
        for (const a of s.assignments) {
          if (!byWorker[a.worker_name]) byWorker[a.worker_name] = { shifts: 0, hours: 0, attended: 0 };
          byWorker[a.worker_name].shifts++;
          byWorker[a.worker_name].hours += h;
          if (a.attended === 1) byWorker[a.worker_name].attended++;
        }
      }

      autoTable(doc, {
        startY: 36,
        head: [["Mitarbeiter", "Schichten", "Gesamtstunden", "Anwesend"]],
        body: Object.entries(byWorker).sort((a, b) => b[1].hours - a[1].hours).map(([name, d]) => [
          name, d.shifts, `${d.hours % 1 === 0 ? d.hours : d.hours.toFixed(1)}h`, `${d.attended}/${d.shifts}`
        ]),
        headStyles: { fillColor: [55, 48, 163], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [238, 242, 255] },
        columnStyles: { 2: { fontStyle: "bold", textColor: [79, 70, 229] } },
      });

      // Detailliste
      const afterSummary = (doc as any).lastAutoTable.finalY + 10;
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Schichten-Detail", 14, afterSummary);

      autoTable(doc, {
        startY: afterSummary + 4,
        head: [["Datum", "Aufgabe", "Von–Bis", "Mitarbeiter", "Anwesend"]],
        body: shifts.flatMap(s => {
          const [sh, sm] = s.start_time.split(":").map(Number);
          const [eh, em] = s.end_time.split(":").map(Number);
          const h = (eh * 60 + em - sh * 60 - sm) / 60;
          if (s.assignments.length === 0) return [[s.date, s.task, `${s.start_time}–${s.end_time} (${h}h)`, "—", "—"]];
          return s.assignments.map(a => [s.date, s.task, `${s.start_time}–${s.end_time} (${h}h)`, a.worker_name, a.attended === 1 ? "Ja" : "Nein"]);
        }),
        headStyles: { fillColor: [55, 48, 163], textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [238, 242, 255] },
        didParseCell: (data: any) => {
          if (data.column.index === 4 && data.cell.raw === "Ja") {
            data.cell.styles.textColor = [22, 163, 74];
            data.cell.styles.fontStyle = "bold";
          }
          if (data.column.index === 4 && data.cell.raw === "Nein") {
            data.cell.styles.textColor = [185, 28, 28];
          }
        },
      });

      const filename = `EquiPlan_Schichten_${new Date().toISOString().slice(0, 10)}.pdf`;
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isIOS) {
        window.open(doc.output("datauristring"), "_blank");
      } else {
        const blob = doc.output("blob");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-gray-700 dark:text-gray-200 text-lg">🕐 Schichtplan</h3>
        <div className="flex gap-2 items-center flex-wrap">
          <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)}
            className={inputClass + " text-sm py-1.5"} />
          {filterDate && <button onClick={() => setFilterDate("")} className="text-xs text-gray-400 hover:text-gray-600">✕</button>}
          {shifts.length > 0 && <>
            <button onClick={exportExcel} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-green-700">📊 Excel</button>
            <button onClick={exportPDF} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-red-700">📄 PDF</button>
          </>}
          <button onClick={() => setEditShift({ date: filterDate || today(), start_time: "08:00", end_time: "17:00" })}
            className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+ Schicht</button>
        </div>
      </div>

      {/* Stunden-Übersicht */}
      {Object.keys(workerHours).length > 0 && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-3">
          <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 mb-2">Stunden-Übersicht {filterDate ? `(${filterDate})` : "(gesamt)"}</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(workerHours).sort((a, b) => b[1] - a[1]).map(([name, h]) => (
              <span key={name} className="bg-white dark:bg-gray-800 border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1 text-xs">
                <span className="font-medium">{name}</span> · {h % 1 === 0 ? h : h.toFixed(1)}h
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Schicht-Formular */}
      {editShift !== null && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          <h4 className="font-semibold text-gray-700 dark:text-gray-200">{editShift.id ? "Schicht bearbeiten" : "Neue Schicht"}</h4>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Datum"><input type="date" value={editShift.date ?? ""} onChange={e => setEditShift(v => ({ ...v!, date: e.target.value }))} className={inputClass} /></Field>
            <Field label="Aufgabe"><input value={editShift.task ?? ""} onChange={e => setEditShift(v => ({ ...v!, task: e.target.value }))} className={inputClass} placeholder="z.B. Parcours A" /></Field>
            <Field label="Von"><input type="time" value={editShift.start_time ?? ""} onChange={e => setEditShift(v => ({ ...v!, start_time: e.target.value }))} className={inputClass} /></Field>
            <Field label="Bis"><input type="time" value={editShift.end_time ?? ""} onChange={e => setEditShift(v => ({ ...v!, end_time: e.target.value }))} className={inputClass} /></Field>
          </div>
          <Field label="Notizen (optional)"><input value={editShift.notes ?? ""} onChange={e => setEditShift(v => ({ ...v!, notes: e.target.value }))} className={inputClass} placeholder="Besonderheiten..." /></Field>
          <div className="flex gap-2">
            <button onClick={saveShift} className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-indigo-700">Speichern</button>
            <button onClick={() => setEditShift(null)} className="border border-gray-300 px-4 py-2 rounded-lg text-sm hover:bg-gray-50">Abbrechen</button>
          </div>
        </div>
      )}

      {/* Schichten-Liste */}
      {shifts.length === 0 && !editShift && (
        <div className="text-center py-10 text-gray-400">
          <div className="text-4xl mb-2">🕐</div>
          <p>Noch keine Schichten angelegt.</p>
        </div>
      )}

      {shifts.map(shift => {
        const [sh, sm] = shift.start_time.split(":").map(Number);
        const [eh, em] = shift.end_time.split(":").map(Number);
        const hours = (eh * 60 + em - sh * 60 - sm) / 60;
        const isExpanded = expandedId === shift.id;

        return (
          <div key={shift.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <div className="p-3 flex items-center gap-3 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : shift.id)}>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-gray-800 dark:text-gray-100">{shift.task}</span>
                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    {shift.start_time}–{shift.end_time} ({hours % 1 === 0 ? hours : hours.toFixed(1)}h)
                  </span>
                  <span className="text-xs text-gray-400">{shift.date}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">{shift.worker_count} Mitarbeiter</span>
                  {shift.attended_count > 0 && (
                    <span className="text-xs text-green-600">✓ {shift.attended_count} anwesend</span>
                  )}
                  {shift.notes && <span className="text-xs text-gray-400 italic">{shift.notes}</span>}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={e => { e.stopPropagation(); setEditShift({ ...shift }); }} className="text-xs text-blue-600 hover:underline px-1">Bearbeiten</button>
                <button onClick={e => { e.stopPropagation(); deleteShift(shift.id); }} className="text-xs text-red-500 hover:underline px-1">Löschen</button>
                <span className="text-gray-400 text-sm">{isExpanded ? "▲" : "▼"}</span>
              </div>
            </div>

            {isExpanded && (
              <div className="border-t border-gray-100 dark:border-gray-700 p-3 space-y-2 bg-gray-50 dark:bg-gray-900/30">
                {shift.assignments.map(a => (
                  <div key={a.id} className="flex items-center gap-2">
                    <button onClick={() => toggleAttended(a)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 transition ${a.attended === 1 ? "bg-green-500 border-green-500 text-white" : "border-gray-300 hover:border-green-400"}`}>
                      {a.attended === 1 ? "✓" : ""}
                    </button>
                    <span className={`flex-1 text-sm ${a.attended === 1 ? "text-gray-800 dark:text-gray-100" : "text-gray-500 dark:text-gray-400"}`}>{a.worker_name}</span>
                    {a.notes && <span className="text-xs text-gray-400 italic">{a.notes}</span>}
                    <button onClick={() => removeWorker(a.id)} className="text-xs text-red-400 hover:text-red-600">✕</button>
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <input
                    value={newWorker[shift.id] ?? ""}
                    onChange={e => setNewWorker(v => ({ ...v, [shift.id]: e.target.value }))}
                    onKeyDown={e => e.key === "Enter" && addWorker(shift.id)}
                    placeholder="Mitarbeitername..."
                    className={inputClass + " text-sm py-1.5 flex-1"}
                  />
                  <button onClick={() => addWorker(shift.id)} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm hover:bg-indigo-700">+</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
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

function DocumentsAdminTab({ tournamentId, isSuperAdmin }: { tournamentId?: number; isSuperAdmin?: boolean }) {
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
      {/* Allgemeine Dokumente — nur Super-Admin */}
      {isSuperAdmin && (
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
      )}

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

// ── Infos-Overlay: Telefonliste + Dokumente hinter einem Button ──────────────
function InfoModal({ tournamentId, onClose }: { tournamentId: number; onClose: () => void }) {
  const [tab, setTab] = useState<"kontakte" | "dokumente">("kontakte");
  const tabCls = (active: boolean) =>
    `flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${active ? "bg-indigo-600 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-4 pt-4 pb-3 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 dark:text-gray-100 text-lg">ℹ️ Infos</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none">✕</button>
          </div>
          <div className="flex gap-2">
            <button className={tabCls(tab === "kontakte")} onClick={() => setTab("kontakte")}>📞 Telefonliste</button>
            <button className={tabCls(tab === "dokumente")} onClick={() => setTab("dokumente")}>📄 Dokumente</button>
          </div>
        </div>
        <div className="p-4">
          {tab === "kontakte" ? <ContactsViewer tournamentId={tournamentId} embedded /> : <DocumentsViewer tournamentId={tournamentId} embedded />}
        </div>
      </div>
    </div>
  );
}

// ── Telefonliste: Viewer für alle Nutzer (read-only, mit Anruf-Links) ─────────
function ContactsViewer({ tournamentId, embedded }: { tournamentId: number; embedded?: boolean }) {
  const [contacts, setContacts] = useState<Contact[]>([]);

  useEffect(() => {
    fetch(`/api/contacts?tournament_id=${tournamentId}`).then(r => r.ok ? r.json() : []).then(setContacts);
  }, [tournamentId]);

  if (contacts.length === 0) {
    return embedded ? <p className="text-sm text-gray-400 py-4 text-center">Keine Kontakte hinterlegt.</p> : null;
  }

  return (
    <div className={embedded ? "" : "mt-6"}>
      {!embedded && <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Telefonliste</h3>}
      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl flex items-start gap-3 p-3">
            <span className="text-xl shrink-0">📞</span>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-gray-800 dark:text-gray-100 break-words">{c.name}</p>
              {c.role && <p className="text-sm text-gray-500 dark:text-gray-400 break-words">{c.role}</p>}
            </div>
            {c.phone && (
              <a href={`tel:${c.phone.replace(/\s/g, "")}`}
                className="shrink-0 text-sm font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition whitespace-nowrap">
                📲 {c.phone}
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dokumente: Viewer für alle Nutzer ─────────────────────────────────────────
function DocumentsViewer({ tournamentId, embedded }: { tournamentId: number; embedded?: boolean }) {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [fullscreenDoc, setFullscreenDoc] = useState<DocMeta | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/documents?scope=general").then(r => r.ok ? r.json() : []),
      fetch(`/api/documents?tournament_id=${tournamentId}`).then(r => r.ok ? r.json() : []),
    ]).then(([general, tournament]) => setDocs([...general, ...tournament]));
  }, [tournamentId]);

  if (docs.length === 0) {
    return embedded ? <p className="text-sm text-gray-400 py-4 text-center">Keine Dokumente hinterlegt.</p> : null;
  }

  return (
    <div className={embedded ? "" : "mt-6"}>
      {!embedded && <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">Dokumente</h3>}
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
