import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

// POST { shift_id, helper_id } — Helfer aus der zentralen Liste zuweisen (kein Freitext)
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { shift_id, helper_id, notes } = await req.json();
  if (!shift_id || !helper_id) return NextResponse.json({ error: "shift_id und helper_id erforderlich" }, { status: 400 });

  const db = getDb();
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
  // Nur Anwesenheit/Notiz aktualisieren – der Helfer ist beim Anlegen per Dropdown fix gesetzt
  getDb().prepare("UPDATE shift_assignments SET attended=?, notes=? WHERE id=?")
    .run(attended ?? 0, notes ?? null, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await req.json();
  getDb().prepare("DELETE FROM shift_assignments WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
