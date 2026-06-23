import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession, canManageTournament } from "@/lib/auth";
import { notifyShiftTeam } from "@/lib/notify";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = getDb();
  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  const date = req.nextUrl.searchParams.get("date");

  // Show-Admins automatisch auf ihr Turnier beschränken, unabhängig vom Query-Parameter
  const effectiveTournamentId =
    session.adminTournamentId != null ? String(session.adminTournamentId) : tournamentId;

  let query = `
    SELECT s.*, t.name AS team_name,
      (SELECT COUNT(*) FROM shift_assignments WHERE shift_id = s.id) as worker_count,
      (SELECT COUNT(*) FROM shift_assignments WHERE shift_id = s.id AND attended = 1) as attended_count
    FROM shifts s LEFT JOIN teams t ON s.team_id = t.id WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (effectiveTournamentId) { query += " AND s.tournament_id = ?"; params.push(Number(effectiveTournamentId)); }
  if (date) { query += " AND s.date = ?"; params.push(date); }
  query += " ORDER BY s.date, s.start_time";

  const shifts = db.prepare(query).all(...params);

  const result = (shifts as Record<string, unknown>[]).map(shift => ({
    ...shift,
    assignments: db.prepare("SELECT * FROM shift_assignments WHERE shift_id = ? ORDER BY worker_name").all(shift.id as number),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { tournament_id, date, start_time, end_time, task, notes, team_id } = await req.json();
  if (!date || !start_time || !end_time || !task) return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });
  if (!canManageTournament(session, tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  const db = getDb();
  const result = db.prepare(
    "INSERT INTO shifts (tournament_id, date, start_time, end_time, task, notes, team_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(tournament_id ?? null, date, start_time, end_time, task, notes ?? null, team_id ?? null);

  const id = Number(result.lastInsertRowid);
  // Bei direkter Team-Zuweisung automatisch alle Mitglieder benachrichtigen
  let notified = null;
  if (team_id) notified = await notifyShiftTeam(id);

  return NextResponse.json({ id, notified }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id, tournament_id, date, start_time, end_time, task, notes, team_id } = await req.json();
  const db = getDb();
  const existing = db.prepare("SELECT tournament_id, team_id FROM shifts WHERE id = ?").get(id) as { tournament_id: number | null; team_id: number | null } | undefined;
  if (!existing) return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
  if (!canManageTournament(session, existing.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  const prev = existing;

  db.prepare(
    "UPDATE shifts SET tournament_id=?, date=?, start_time=?, end_time=?, task=?, notes=?, team_id=? WHERE id=?"
  ).run(tournament_id ?? null, date, start_time, end_time, task, notes ?? null, team_id ?? null, id);

  // Nur benachrichtigen, wenn ein (neues/anderes) Team zugewiesen wurde
  let notified = null;
  if (team_id && prev?.team_id !== team_id) notified = await notifyShiftTeam(id);

  return NextResponse.json({ ok: true, notified });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await req.json();
  const db = getDb();
  const existing = db.prepare("SELECT tournament_id FROM shifts WHERE id = ?").get(id) as { tournament_id: number | null } | undefined;
  if (!existing) return NextResponse.json({ ok: true });
  if (!canManageTournament(session, existing.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  db.prepare("DELETE FROM shifts WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
