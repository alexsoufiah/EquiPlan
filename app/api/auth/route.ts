import { NextRequest, NextResponse } from "next/server";
import { getPasswords, verifyPassword, createToken, initDefaultPasswords, hashPassword, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cookies } from "next/headers";

// Session-Cookie-Optionen: in Produktion zwingend Secure (JWT nie über http senden).
const COOKIE = { httpOnly: true as const, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production" };

// In-Memory Rate-Limiter: max. 10 Fehlversuche pro IP innerhalb von 15 Minuten.
// Reicht für einen Single-Process-Deploy; setzt sich bei jedem Neustart zurück.
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function getIp(req: NextRequest): string {
  // Nicht die LINKESTE X-Forwarded-For-Adresse nehmen — die ist voll client-kontrolliert
  // (Proxies hängen HINTEN an), sonst lässt sich der Rate-Limiter durch Header-Rotation aushebeln.
  // Bevorzugt x-real-ip (vom Edge gesetzt), sonst der letzte (proxy-nächste) XFF-Hop.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
function isRateLimited(ip: string): boolean {
  const entry = loginAttempts.get(ip);
  if (!entry || Date.now() > entry.resetAt) return false;
  return entry.count >= MAX_ATTEMPTS;
}
function recordFailure(ip: string): void {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count++;
}

export async function POST(req: NextRequest) {
  await initDefaultPasswords();
  const ip = getIp(req);
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Zu viele Versuche. Bitte in 15 Minuten erneut versuchen." }, { status: 429, headers: { "Retry-After": "900" } });
  }

  const { password, email } = await req.json();
  const { viewerHash, adminHash } = getPasswords();
  const db = getDb();

  // Helfer-Login per E-Mail + Passwort (wenn E-Mail angegeben)
  if (email && typeof email === "string" && email.trim()) {
    const helper = db.prepare("SELECT id, first_name, last_name, password_hash FROM helpers WHERE email = ? COLLATE NOCASE")
      .get(email.trim()) as { id: number; first_name: string; last_name: string; password_hash: string | null } | undefined;
    if (helper?.password_hash && await verifyPassword(password, helper.password_hash)) {
      const name = `${helper.first_name} ${helper.last_name}`.trim();
      const token = await createToken({ role: "helper", helperId: helper.id, helperName: name });
      (await cookies()).set("session", token, COOKIE);
      return NextResponse.json({ role: "helper", helperId: helper.id, helperName: name });
    }
    recordFailure(ip);
    return NextResponse.json({ error: "E-Mail oder Passwort falsch" }, { status: 401 });
  }

  // Haupt-Admin (legacy password)
  if (adminHash && await verifyPassword(password, adminHash)) {
    const token = await createToken({ role: "admin" });
    (await cookies()).set("session", token, COOKIE);
    return NextResponse.json({ role: "admin" });
  }

  // Show-Admins (aus admins-Tabelle)
  const admins = db.prepare("SELECT id, name, password_hash, tournament_id FROM admins").all() as { id: number; name: string; password_hash: string; tournament_id: number | null }[];
  for (const admin of admins) {
    if (await verifyPassword(password, admin.password_hash)) {
      const session = admin.tournament_id === null
        ? { role: "admin" as const, adminId: admin.id, adminName: admin.name }
        : { role: "admin" as const, adminId: admin.id, adminName: admin.name, adminTournamentId: admin.tournament_id };
      const token = await createToken(session);
      (await cookies()).set("session", token, COOKIE);
      return NextResponse.json({ role: "admin", adminName: admin.name, adminTournamentId: admin.tournament_id ?? undefined });
    }
  }

  // Viewer
  if (viewerHash && await verifyPassword(password, viewerHash)) {
    const token = await createToken({ role: "viewer" });
    (await cookies()).set("session", token, COOKIE);
    return NextResponse.json({ role: "viewer" });
  }

  // Team-Login
  const teams = db.prepare("SELECT id, name, password_hash FROM teams WHERE password_hash IS NOT NULL").all() as { id: number; name: string; password_hash: string }[];
  for (const team of teams) {
    if (await verifyPassword(password, team.password_hash)) {
      const token = await createToken({ role: "team", teamId: team.id, teamName: team.name });
      (await cookies()).set("session", token, COOKIE);
      return NextResponse.json({ role: "team", teamId: team.id, teamName: team.name });
    }
  }

  // Sprecher-Login
  const speakers = db.prepare("SELECT id, name, role, color, password_hash FROM speakers WHERE password_hash IS NOT NULL").all() as { id: number; name: string; role: string; color: string; password_hash: string }[];
  for (const speaker of speakers) {
    if (await verifyPassword(password, speaker.password_hash)) {
      const token = await createToken({ role: "speaker", speakerId: speaker.id, speakerName: speaker.name, speakerRole: speaker.role, speakerColor: speaker.color });
      (await cookies()).set("session", token, COOKIE);
      return NextResponse.json({ role: "speaker", speakerId: speaker.id, speakerName: speaker.name, speakerRole: speaker.role, speakerColor: speaker.color });
    }
  }

  recordFailure(ip);
  return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
}

export async function DELETE() {
  (await cookies()).delete("session");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  // Nur Super-Admin: die globalen admin_password/viewer_password sind turnier-übergreifend.
  // Ein Show-Admin dürfte sich sonst ein neues admin_password setzen und sich per Legacy-Login
  // zum Super-Admin eskalieren.
  if (!(session?.role === "admin" && session.adminTournamentId == null)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const { viewerPassword, adminPassword } = await req.json();
  const db = getDb();

  if (viewerPassword) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('viewer_password', ?)").run(await hashPassword(viewerPassword));
  }
  if (adminPassword) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)").run(await hashPassword(adminPassword));
  }

  return NextResponse.json({ ok: true });
}
