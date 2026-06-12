import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, hashPassword } from "@/lib/auth";

function isSuperAdmin(session: Awaited<ReturnType<typeof getSession>>) {
  return session?.role === "admin" && !session.adminTournamentId;
}

export async function GET() {
  const session = await getSession();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Nur Haupt-Admin" }, { status: 403 });

  const db = getDb();
  const admins = db.prepare(`
    SELECT a.id, a.name, a.tournament_id, t.name as tournament_name, a.created_at
    FROM admins a
    LEFT JOIN tournaments t ON t.id = a.tournament_id
    ORDER BY a.created_at DESC
  `).all();
  return NextResponse.json(admins);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Nur Haupt-Admin" }, { status: 403 });

  const { name, password, tournament_id } = await req.json();
  if (!name?.trim() || !password?.trim()) return NextResponse.json({ error: "Name und Passwort erforderlich" }, { status: 400 });

  const hash = await hashPassword(password);
  const db = getDb();
  const result = db.prepare(
    "INSERT INTO admins (name, password_hash, tournament_id) VALUES (?, ?, ?)"
  ).run(name.trim(), hash, tournament_id ?? null);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Nur Haupt-Admin" }, { status: 403 });

  const { id, name, password, tournament_id } = await req.json();
  const db = getDb();

  if (password?.trim()) {
    const hash = await hashPassword(password);
    db.prepare("UPDATE admins SET name=?, password_hash=?, tournament_id=? WHERE id=?").run(name.trim(), hash, tournament_id ?? null, id);
  } else {
    db.prepare("UPDATE admins SET name=?, tournament_id=? WHERE id=?").run(name.trim(), tournament_id ?? null, id);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!isSuperAdmin(session)) return NextResponse.json({ error: "Nur Haupt-Admin" }, { status: 403 });

  const { id } = await req.json();
  getDb().prepare("DELETE FROM admins WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
