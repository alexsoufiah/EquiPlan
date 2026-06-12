import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";

const SAFE_SELECT = "SELECT id, name, role, color, CASE WHEN password_hash IS NOT NULL THEN 1 ELSE 0 END as has_password FROM speakers";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getDb().prepare(`${SAFE_SELECT} ORDER BY id`).all());
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, role, color } = await req.json();
  const result = getDb().prepare("INSERT INTO speakers (name, role, color) VALUES (?, ?, ?)").run(name, role, color || "#3B82F6");
  return NextResponse.json(getDb().prepare(`${SAFE_SELECT} WHERE id = ?`).get(result.lastInsertRowid), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = getDb();
  const { id, name, role, color, password } = await req.json();

  if (password === null) {
    db.prepare("UPDATE speakers SET name=?, role=?, color=?, password_hash=NULL WHERE id=?").run(name, role, color, id);
  } else if (password) {
    const hash = await hashPassword(password);
    db.prepare("UPDATE speakers SET name=?, role=?, color=?, password_hash=? WHERE id=?").run(name, role, color, hash, id);
  } else {
    db.prepare("UPDATE speakers SET name=?, role=?, color=? WHERE id=?").run(name, role, color, id);
  }

  return NextResponse.json(db.prepare(`${SAFE_SELECT} WHERE id = ?`).get(id));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM speakers WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
