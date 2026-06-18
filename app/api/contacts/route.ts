import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET ?tournament_id=  -> Telefonliste (alle eingeloggten Rollen dürfen lesen)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tournamentId = new URL(req.url).searchParams.get("tournament_id");
  const db = getDb();
  const rows = tournamentId
    ? db.prepare("SELECT * FROM contacts WHERE tournament_id = ? ORDER BY sort_order, name").all(Number(tournamentId))
    : db.prepare("SELECT * FROM contacts ORDER BY sort_order, name").all();
  return NextResponse.json(rows);
}

// POST { tournament_id, name, role, phone } (nur Admin)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { tournament_id, name, role, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  const db = getDb();
  const r = db.prepare("INSERT INTO contacts (tournament_id, name, role, phone) VALUES (?, ?, ?, ?)")
    .run(tournament_id || null, name.trim(), role?.trim() || null, phone?.trim() || null);
  return NextResponse.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(r.lastInsertRowid), { status: 201 });
}

// PUT { id, name, role, phone } (nur Admin)
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id, name, role, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  const db = getDb();
  db.prepare("UPDATE contacts SET name=?, role=?, phone=? WHERE id=?")
    .run(name.trim(), role?.trim() || null, phone?.trim() || null, id);
  return NextResponse.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(id));
}

// DELETE { id } (nur Admin)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM contacts WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
