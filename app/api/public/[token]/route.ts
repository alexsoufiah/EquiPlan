import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type Database from "better-sqlite3";

function attachTeams(db: Database.Database, entries: Record<string, unknown>[]) {
  if (entries.length === 0) return entries;
  const ids = entries.map(e => e.id as number);
  const rows = db.prepare(`
    SELECT et.entry_id, t.id, t.name
    FROM schedule_entry_teams et JOIN teams t ON et.team_id = t.id
    WHERE et.entry_id IN (${ids.join(",")})
  `).all() as { entry_id: number; id: number; name: string }[];
  const byEntry: Record<number, { id: number; name: string }[]> = {};
  for (const r of rows) { if (!byEntry[r.entry_id]) byEntry[r.entry_id] = []; byEntry[r.entry_id].push({ id: r.id, name: r.name }); }
  return entries.map(e => ({ ...e, teams: byEntry[e.id as number] ?? [] }));
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();

  const tournament = db.prepare("SELECT * FROM tournaments WHERE share_token = ?").get(token) as Record<string, unknown> | undefined;
  if (!tournament) return NextResponse.json({ error: "Link ungültig oder abgelaufen" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const arenaId = searchParams.get("arena_id");

  let query = `
    SELECT e.*, a.name as arena_name,
      s.name as speaker_name, s.role as speaker_role, s.color as speaker_color
    FROM schedule_entries e
    LEFT JOIN arenas a ON e.arena_id = a.id
    LEFT JOIN speakers s ON e.speaker_id = s.id
    WHERE e.tournament_id = ?
  `;
  const args: (string | number)[] = [tournament.id as number];
  if (date) { query += " AND e.date = ?"; args.push(date); }
  if (arenaId) { query += " AND e.arena_id = ?"; args.push(Number(arenaId)); }
  query += " ORDER BY e.date, e.start_time";

  const entries = db.prepare(query).all(...args);
  const arenas = db.prepare(`
    SELECT DISTINCT a.id, a.name FROM arenas a
    JOIN schedule_entries e ON e.arena_id = a.id
    WHERE e.tournament_id = ? ORDER BY a.name
  `).all(tournament.id as number);

  // Alle verfügbaren Tage
  const dates = db.prepare(
    "SELECT DISTINCT date FROM schedule_entries WHERE tournament_id = ? ORDER BY date"
  ).all(tournament.id as number) as { date: string }[];

  return NextResponse.json({
    tournament: { id: tournament.id, name: tournament.name, location: tournament.location, start_date: tournament.start_date, end_date: tournament.end_date },
    arenas,
    dates: dates.map(d => d.date),
    entries: attachTeams(db, entries as Record<string, unknown>[]),
  });
}
