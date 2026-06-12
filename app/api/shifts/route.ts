import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  const date = req.nextUrl.searchParams.get("date");

  let query = `
    SELECT s.*,
      (SELECT COUNT(*) FROM shift_assignments WHERE shift_id = s.id) as worker_count,
      (SELECT COUNT(*) FROM shift_assignments WHERE shift_id = s.id AND attended = 1) as attended_count
    FROM shifts s WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (tournamentId) { query += " AND s.tournament_id = ?"; params.push(Number(tournamentId)); }
  if (date) { query += " AND s.date = ?"; params.push(date); }
  query += " ORDER BY s.date, s.start_time";

  const shifts = db.prepare(query).all(...params);

  // Assignments für jede Schicht laden
  const result = (shifts as any[]).map(shift => ({
    ...shift,
    assignments: db.prepare("SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY worker_name").all(shift.id),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { tournament_id, date, start_time, end_time, task, notes } = await req.json();
  if (!date || !start_time || !end_time || !task) return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });

  const db = getDb();
  const result = db.prepare(
    "INSERT INTO shifts (tournament_id, date, start_time, end_time, task, notes) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(tournament_id ?? null, date, start_time, end_time, task, notes ?? null);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id, tournament_id, date, start_time, end_time, task, notes } = await req.json();
  getDb().prepare(
    "UPDATE shifts SET tournament_id=?, date=?, start_time=?, end_time=?, task=?, notes=? WHERE id=?"
  ).run(tournament_id ?? null, date, start_time, end_time, task, notes ?? null, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await req.json();
  getDb().prepare("DELETE FROM shifts WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
