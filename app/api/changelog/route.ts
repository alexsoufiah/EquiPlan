import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = getDb();
  // Show-Admins sehen nur die Änderungen ihres Turniers, Super-Admins alle.
  const entries = session.adminTournamentId == null
    ? db.prepare("SELECT * FROM change_log ORDER BY created_at DESC LIMIT 50").all()
    : db.prepare("SELECT * FROM change_log WHERE tournament_id = ? ORDER BY created_at DESC LIMIT 50").all(session.adminTournamentId);
  return NextResponse.json(entries);
}
