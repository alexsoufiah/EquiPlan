import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET ?tournament_id= -> Telefonliste (nur Admins, tournament_id erforderlich)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tournamentId = new URL(req.url).searchParams.get("tournament_id");
  if (!tournamentId) return NextResponse.json({ error: "tournament_id fehlt" }, { status: 400 });
  if (!canManageTournament(session, tournamentId)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  const rows = getDb().prepare("SELECT * FROM contacts WHERE tournament_id = ? ORDER BY sort_order, name").all(Number(tournamentId));
  return NextResponse.json(rows);
}

// POST { tournament_id, name, role, phone } (nur Admin)
export async function POST(req: NextRequest) {
  const session = await getSession();
  const { tournament_id, name, role, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  if (!canManageTournament(session, tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  const db = getDb();
  const r = db.prepare("INSERT INTO contacts (tournament_id, name, role, phone) VALUES (?, ?, ?, ?)")
    .run(tournament_id || null, name.trim(), role?.trim() || null, phone?.trim() || null);
  return NextResponse.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(r.lastInsertRowid), { status: 201 });
}

// PUT { id, name, role, phone } (nur Admin)
export async function PUT(req: NextRequest) {
  const session = await getSession();
  const { id, name, role, phone } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Name fehlt" }, { status: 400 });
  const db = getDb();
  const existing = db.prepare("SELECT tournament_id FROM contacts WHERE id = ?").get(id) as { tournament_id: number | null } | undefined;
  if (!existing) return NextResponse.json({ error: "Kontakt nicht gefunden" }, { status: 404 });
  if (!canManageTournament(session, existing.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  db.prepare("UPDATE contacts SET name=?, role=?, phone=? WHERE id=?")
    .run(name.trim(), role?.trim() || null, phone?.trim() || null, id);
  return NextResponse.json(db.prepare("SELECT * FROM contacts WHERE id = ?").get(id));
}

// DELETE { id } (nur Admin)
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  const { id } = await req.json();
  const db = getDb();
  const existing = db.prepare("SELECT tournament_id FROM contacts WHERE id = ?").get(id) as { tournament_id: number | null } | undefined;
  if (!existing) return NextResponse.json({ ok: true });
  if (!canManageTournament(session, existing.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  db.prepare("DELETE FROM contacts WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
