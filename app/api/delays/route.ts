import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/sse";

// GET ?tournament_id=&date=  -> [{ arena_id, minutes }]
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tournamentId = Number(searchParams.get("tournament_id"));
  const date = searchParams.get("date");
  if (!tournamentId || !date) return NextResponse.json([]);
  const db = getDb();
  const rows = db.prepare(
    "SELECT arena_id, minutes FROM arena_delays WHERE tournament_id = ? AND date = ? AND minutes <> 0"
  ).all(tournamentId, date);
  return NextResponse.json(rows);
}

// POST { tournament_id, date, arena_id (0 = ganzer Tag), minutes }
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { tournament_id, date, arena_id, minutes } = await req.json();
  if (!tournament_id || !date) return NextResponse.json({ error: "tournament_id/date fehlt" }, { status: 400 });
  const db = getDb();
  const aid = Number(arena_id) || 0;
  const min = Math.max(0, Math.round(Number(minutes) || 0));
  db.prepare(`
    INSERT INTO arena_delays (tournament_id, date, arena_id, minutes, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(tournament_id, date, arena_id) DO UPDATE SET minutes = excluded.minutes, updated_at = datetime('now')
  `).run(tournament_id, date, aid, min);
  broadcast("update", { action: "delay", tournament_id, date });
  return NextResponse.json({ ok: true });
}
