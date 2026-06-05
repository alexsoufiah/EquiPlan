import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import type Database from "better-sqlite3";

const ENTRY_QUERY = `
  SELECT e.*,
    s.name as speaker_name, s.role as speaker_role, s.color as speaker_color,
    a.name as arena_name,
    tr.name as tournament_name
  FROM schedule_entries e
  LEFT JOIN speakers s ON e.speaker_id = s.id
  LEFT JOIN arenas a ON e.arena_id = a.id
  LEFT JOIN tournaments tr ON e.tournament_id = tr.id
`;

function attachTeams(db: Database.Database, entries: Record<string, unknown>[]) {
  if (entries.length === 0) return entries;
  const ids = entries.map(e => e.id as number);
  const teamsForEntry = db.prepare(`
    SELECT et.entry_id, t.id, t.name
    FROM schedule_entry_teams et
    JOIN teams t ON et.team_id = t.id
    WHERE et.entry_id IN (${ids.join(",")})
  `).all() as { entry_id: number; id: number; name: string }[];

  const byEntry: Record<number, { id: number; name: string }[]> = {};
  for (const r of teamsForEntry) {
    if (!byEntry[r.entry_id]) byEntry[r.entry_id] = [];
    byEntry[r.entry_id].push({ id: r.id, name: r.name });
  }
  return entries.map(e => ({ ...e, teams: byEntry[(e.id as number)] ?? [] }));
}

function setTeams(db: Database.Database, entryId: number | bigint, teamIds: number[]) {
  db.prepare("DELETE FROM schedule_entry_teams WHERE entry_id = ?").run(entryId);
  const ins = db.prepare("INSERT OR IGNORE INTO schedule_entry_teams (entry_id, team_id) VALUES (?, ?)");
  for (const tid of teamIds) ins.run(entryId, tid);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const tournamentId = searchParams.get("tournament_id");

  let query = ENTRY_QUERY + " WHERE 1=1";
  const args: (string | number)[] = [];

  if (tournamentId) { query += " AND e.tournament_id = ?"; args.push(Number(tournamentId)); }
  if (date) { query += " AND e.date = ?"; args.push(date); }
  query += " ORDER BY e.date, e.start_time";

  const rows = db.prepare(query).all(...args);
  return NextResponse.json(attachTeams(db, rows as Record<string, unknown>[]));
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = getDb();
  const body = await req.json();
  const { tournament_id, date, start_time, end_time, title, phase, pruefungs_id, arena_id, team_ids, speaker_id, notes } = body;

  const result = db.prepare(`
    INSERT INTO schedule_entries (tournament_id, date, start_time, end_time, title, phase, pruefungs_id, arena_id, speaker_id, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(tournament_id || null, date, start_time, end_time, title, phase, pruefungs_id || null, arena_id || null, speaker_id || null, notes || null);

  if (Array.isArray(team_ids) && team_ids.length > 0) setTeams(db, result.lastInsertRowid, team_ids);

  const tournament = tournament_id ? (db.prepare("SELECT name FROM tournaments WHERE id = ?").get(tournament_id) as { name: string } | undefined)?.name : "";
  db.prepare("INSERT INTO change_log (tournament_id, action, entry_id, description) VALUES (?, ?, ?, ?)").run(
    tournament_id || null, "create", result.lastInsertRowid, `Neuer Eintrag: ${title} am ${date}`
  );

  await sendPushNotification("Zeitplan aktualisiert", `${tournament ? `[${tournament}] ` : ""}Neuer Eintrag: ${title} am ${date} ${start_time}–${end_time}`);

  const entry = db.prepare(`${ENTRY_QUERY} WHERE e.id = ?`).get(result.lastInsertRowid);
  return NextResponse.json(attachTeams(db, [entry as Record<string, unknown>])[0], { status: 201 });
}
