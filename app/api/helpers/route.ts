import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/auth";

// GET /api/helpers?entry_id=X  — admin sees helpers for an entry
export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || (session.role !== "admin" && session.role !== "viewer")) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const entryId = req.nextUrl.searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ error: "entry_id fehlt" }, { status: 400 });

  const db = getDb();
  const helpers = db.prepare(
    "SELECT id, name, contact, note, signed_up_at FROM event_helpers WHERE entry_id = ? ORDER BY signed_up_at ASC"
  ).all(Number(entryId));
  return NextResponse.json(helpers);
}

// POST /api/helpers  — public signup via share token
// Body: { entry_id, share_token, name, contact, note? }
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { entry_id, share_token, name, contact, note } = body;

  if (!entry_id || !share_token || !name?.trim() || !contact?.trim()) {
    return NextResponse.json({ error: "Pflichtfelder: entry_id, share_token, name, contact" }, { status: 400 });
  }

  // Validate share_token belongs to the tournament of this entry
  const entry = db.prepare(`
    SELECT se.id, se.helpers_needed, se.helpers_task, se.date, se.start_time, se.end_time, se.title, se.tournament_id, t.share_token, t.staff_token
    FROM schedule_entries se
    JOIN tournaments t ON t.id = se.tournament_id
    WHERE se.id = ?
  `).get(Number(entry_id)) as { id: number; helpers_needed: number; helpers_task?: string; date: string; start_time: string; end_time: string; title: string; tournament_id: number; share_token: string | null; staff_token: string | null } | undefined;

  if (!entry) return NextResponse.json({ error: "Event nicht gefunden" }, { status: 404 });
  // Anmeldung über den öffentlichen ODER den internen Staff-Link erlauben
  if (entry.share_token !== share_token && entry.staff_token !== share_token) return NextResponse.json({ error: "Ungültiger Link" }, { status: 403 });
  if (!entry.helpers_needed || entry.helpers_needed <= 0) return NextResponse.json({ error: "Für dieses Event werden keine Helfer benötigt" }, { status: 400 });

  const currentCount = (db.prepare("SELECT COUNT(*) as c FROM event_helpers WHERE entry_id = ?").get(Number(entry_id)) as { c: number }).c;
  if (currentCount >= entry.helpers_needed) {
    return NextResponse.json({ error: "Alle Helferplätze sind bereits belegt" }, { status: 409 });
  }

  const result = db.prepare(
    "INSERT INTO event_helpers (entry_id, name, contact, note) VALUES (?, ?, ?, ?)"
  ).run(Number(entry_id), name.trim(), contact.trim(), note?.trim() || null);

  // Schicht für diesen Event suchen oder anlegen, Helfer als unbestätigt eintragen
  const task = entry.helpers_task || entry.title;
  let shift = db.prepare(
    "SELECT id FROM shifts WHERE tournament_id = ? AND date = ? AND start_time = ? AND end_time = ? AND task = ?"
  ).get(entry.tournament_id, entry.date, entry.start_time, entry.end_time, task) as { id: number } | undefined;

  if (!shift) {
    const sr = db.prepare(
      "INSERT INTO shifts (tournament_id, date, start_time, end_time, task, notes) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(entry.tournament_id, entry.date, entry.start_time, entry.end_time, task, "Automatisch aus Helfer-Anmeldung");
    shift = { id: Number(sr.lastInsertRowid) };
  }

  db.prepare(
    "INSERT INTO shift_assignments (shift_id, worker_name, attended, notes) VALUES (?, ?, 0, ?)"
  ).run(shift.id, name.trim(), contact.trim());

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

// DELETE /api/helpers  — admin removes a helper
export async function DELETE(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nur Admins" }, { status: 403 });
  }
  const { id } = await req.json();
  getDb().prepare("DELETE FROM event_helpers WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
