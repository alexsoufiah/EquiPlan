import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, canManageTournament } from "@/lib/auth";

// POST { shift_id, helper_id } — Helfer aus der zentralen Liste zuweisen (kein Freitext)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { shift_id, helper_id, notes } = await req.json();
  if (!shift_id || !helper_id) return NextResponse.json({ error: "shift_id und helper_id erforderlich" }, { status: 400 });

  const db = getDb();
  const shift = db.prepare("SELECT tournament_id FROM shifts WHERE id = ?").get(shift_id) as { tournament_id: number | null } | undefined;
  if (!shift) return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
  if (!canManageTournament(session, shift.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  const h = db.prepare("SELECT first_name, last_name FROM helpers WHERE id = ?").get(helper_id) as { first_name: string; last_name: string } | undefined;
  if (!h) return NextResponse.json({ error: "Helfer nicht gefunden" }, { status: 404 });
  const worker_name = `${h.first_name} ${h.last_name}`.trim();

  // Doppelte Zuweisung desselben Helfers vermeiden
  const dup = db.prepare("SELECT id FROM shift_assignments WHERE shift_id = ? AND helper_id = ?").get(shift_id, helper_id);
  if (dup) return NextResponse.json({ error: "Helfer ist dieser Schicht bereits zugewiesen" }, { status: 409 });

  const result = db.prepare(
    "INSERT INTO shift_assignments (shift_id, helper_id, worker_name, notes) VALUES (?, ?, ?, ?)"
  ).run(shift_id, helper_id, worker_name, notes ?? null);

  return NextResponse.json({ id: Number(result.lastInsertRowid), worker_name }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id, attended, notes } = await req.json();
  const db = getDb();
  // tournament_id über shift_assignments → shifts ermitteln
  const scope = db.prepare(
    "SELECT s.tournament_id FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.id = ?"
  ).get(id) as { tournament_id: number | null } | undefined;
  if (!scope) return NextResponse.json({ error: "Zuweisung nicht gefunden" }, { status: 404 });
  if (!canManageTournament(session, scope.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  // Nur Anwesenheit/Notiz aktualisieren – der Helfer ist beim Anlegen per Dropdown fix gesetzt
  db.prepare("UPDATE shift_assignments SET attended=?, notes=? WHERE id=?")
    .run(attended ?? 0, notes ?? null, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await req.json();
  const db = getDb();
  const scope = db.prepare(
    "SELECT s.tournament_id FROM shift_assignments sa JOIN shifts s ON sa.shift_id = s.id WHERE sa.id = ?"
  ).get(id) as { tournament_id: number | null } | undefined;
  if (!scope) return NextResponse.json({ ok: true });
  if (!canManageTournament(session, scope.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  db.prepare("DELETE FROM shift_assignments WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
