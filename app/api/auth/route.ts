import { NextRequest, NextResponse } from "next/server";
import { getPasswords, verifyPassword, createToken, initDefaultPasswords, hashPassword, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  await initDefaultPasswords();
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
      (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
      return NextResponse.json({ role: "helper", helperId: helper.id, helperName: name });
    }
    return NextResponse.json({ error: "E-Mail oder Passwort falsch" }, { status: 401 });
  }

  // Haupt-Admin (legacy password)
  if (adminHash && await verifyPassword(password, adminHash)) {
    const token = await createToken({ role: "admin" });
    (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
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
      (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
      return NextResponse.json({ role: "admin", adminName: admin.name, adminTournamentId: admin.tournament_id ?? undefined });
    }
  }

  // Viewer
  if (viewerHash && await verifyPassword(password, viewerHash)) {
    const token = await createToken({ role: "viewer" });
    (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
    return NextResponse.json({ role: "viewer" });
  }

  // Team-Login
  const teams = db.prepare("SELECT id, name, password_hash FROM teams WHERE password_hash IS NOT NULL").all() as { id: number; name: string; password_hash: string }[];
  for (const team of teams) {
    if (await verifyPassword(password, team.password_hash)) {
      const token = await createToken({ role: "team", teamId: team.id, teamName: team.name });
      (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
      return NextResponse.json({ role: "team", teamId: team.id, teamName: team.name });
    }
  }

  // Sprecher-Login
  const speakers = db.prepare("SELECT id, name, role, color, password_hash FROM speakers WHERE password_hash IS NOT NULL").all() as { id: number; name: string; role: string; color: string; password_hash: string }[];
  for (const speaker of speakers) {
    if (await verifyPassword(password, speaker.password_hash)) {
      const token = await createToken({ role: "speaker", speakerId: speaker.id, speakerName: speaker.name, speakerRole: speaker.role, speakerColor: speaker.color });
      (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
      return NextResponse.json({ role: "speaker", speakerId: speaker.id, speakerName: speaker.name, speakerRole: speaker.role, speakerColor: speaker.color });
    }
  }

  return NextResponse.json({ error: "Falsches Passwort" }, { status: 401 });
}

export async function DELETE() {
  (await cookies()).delete("session");
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

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
