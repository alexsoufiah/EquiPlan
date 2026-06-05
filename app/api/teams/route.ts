import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Passwort-Hash nie ans Frontend senden
  const teams = getDb().prepare("SELECT id, name, description, CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password FROM teams ORDER BY name").all();
  return NextResponse.json(teams);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, description } = await req.json();
  const result = getDb().prepare("INSERT INTO teams (name, description) VALUES (?, ?)").run(name, description || null);
  return NextResponse.json(getDb().prepare("SELECT id, name, description, 0 as has_password FROM teams WHERE id = ?").get(result.lastInsertRowid), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id, name, description, password } = await req.json();
  const db = getDb();

  if (password === null) {
    // Passwort entfernen
    db.prepare("UPDATE teams SET name=?, description=?, password_hash=NULL WHERE id=?").run(name, description || null, id);
  } else if (password) {
    const hash = await hashPassword(password);
    db.prepare("UPDATE teams SET name=?, description=?, password_hash=? WHERE id=?").run(name, description || null, hash, id);
  } else {
    db.prepare("UPDATE teams SET name=?, description=? WHERE id=?").run(name, description || null, id);
  }

  return NextResponse.json(db.prepare("SELECT id, name, description, CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password FROM teams WHERE id = ?").get(id));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM teams WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
