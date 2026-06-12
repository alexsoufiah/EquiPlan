import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";
import { broadcast } from "@/lib/sse";
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

function attachTeams(db: Database.Database, entry: Record<string, unknown>) {
  const teams = db.prepare(`
    SELECT t.id, t.name FROM schedule_entry_teams et
    JOIN teams t ON et.team_id = t.id WHERE et.entry_id = ?
  `).all(entry.id as number) as { id: number; name: string }[];
  return { ...entry, teams };
}

function setTeams(db: Database.Database, entryId: number | string, teamIds: number[]) {
  db.prepare("DELETE FROM schedule_entry_teams WHERE entry_id = ?").run(entryId);
  const ins = db.prepare("INSERT OR IGNORE INTO schedule_entry_teams (entry_id, team_id) VALUES (?, ?)");
  for (const tid of teamIds) ins.run(entryId, tid);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const body = await req.json();
  const { tournament_id, date, start_time, end_time, title, phase, pruefungs_id, arena_id, team_ids, speaker_id, notes, helpers_needed, helpers_task } = body;

  db.prepare(`
    UPDATE schedule_entries SET
      tournament_id=?, date=?, start_time=?, end_time=?, title=?, phase=?, pruefungs_id=?,
      arena_id=?, speaker_id=?, notes=?, helpers_needed=?, helpers_task=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(tournament_id || null, date, start_time, end_time, title, phase, pruefungs_id || null, arena_id || null, speaker_id || null, notes || null, helpers_needed || 0, helpers_task || null, id);

  setTeams(db, id, Array.isArray(team_ids) ? team_ids : []);

  db.prepare("INSERT INTO change_log (action, entry_id, description) VALUES (?, ?, ?)").run(
    "update", id, `Eintrag geändert: ${title} am ${date}`
  );

  await sendPushNotification("Zeitplan geändert", `Eintrag aktualisiert: ${title} am ${date} ${start_time}–${end_time}`);
  broadcast("update", { action: "update", tournament_id, date });

  const entry = db.prepare(`${ENTRY_QUERY} WHERE e.id = ?`).get(id);
  return NextResponse.json(attachTeams(db, entry as Record<string, unknown>));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const db = getDb();

  const entry = db.prepare("SELECT * FROM schedule_entries WHERE id = ?").get(id) as { title: string; date: string } | undefined;
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });

  db.prepare("DELETE FROM schedule_entries WHERE id = ?").run(id);
  db.prepare("INSERT INTO change_log (action, entry_id, description) VALUES (?, ?, ?)").run(
    "delete", id, `Eintrag gelöscht: ${entry.title} am ${entry.date}`
  );

  await sendPushNotification("Zeitplan geändert", `Eintrag entfernt: ${entry.title} am ${entry.date}`);
  broadcast("update", { action: "delete" });

  return NextResponse.json({ ok: true });
}
