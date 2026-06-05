import { NextRequest, NextResponse } from "next/server";
import { getPasswords, verifyPassword, createToken, initDefaultPasswords, hashPassword, getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  await initDefaultPasswords();
  const { password } = await req.json();
  const { viewerHash, adminHash } = getPasswords();
  const db = getDb();

  // Admin
  if (adminHash && await verifyPassword(password, adminHash)) {
    const token = await createToken({ role: "admin" });
    (await cookies()).set("session", token, { httpOnly: true, path: "/", maxAge: 60 * 60 * 24 * 7, sameSite: "lax" });
    return NextResponse.json({ role: "admin" });
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
