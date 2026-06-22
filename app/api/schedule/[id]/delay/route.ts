import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { broadcast } from "@/lib/sse";
import { sendTargetedPush } from "@/lib/push";

// POST { minutes }  -> Verspätung für einen einzelnen Programmpunkt setzen
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await params;
  const { minutes } = await req.json();
  const min = Math.max(0, Math.round(Number(minutes) || 0));
  const db = getDb();

  const entry = db.prepare("SELECT title, date, speaker_id, tournament_id FROM schedule_entries WHERE id = ?").get(id) as
    { title: string; date: string; speaker_id: number | null; tournament_id: number | null } | undefined;
  if (!entry) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canManageTournament(session, entry.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  db.prepare("UPDATE schedule_entries SET delay_minutes = ?, updated_at = datetime('now') WHERE id = ?").run(min, id);

  if (min > 0) {
    const teamIds = (db.prepare("SELECT team_id FROM schedule_entry_teams WHERE entry_id = ?").all(id) as { team_id: number }[]).map(r => r.team_id);
    await sendTargetedPush(
      { teamIds, speakerId: entry.speaker_id },
      "Verspätung",
      `${entry.title}: ca. ${min} Min später.`,
    );
  }

  broadcast("update", { action: "entry-delay", id });
  return NextResponse.json({ ok: true });
}
