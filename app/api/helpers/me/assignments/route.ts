import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET — Einsätze (Schicht-Zuweisungen) des eingeloggten Helfers: wo bin ich, welche Rolle, wann.
export async function GET() {
  const session = await getSession();
  if (session?.role !== "helper" || !session.helperId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const rows = getDb().prepare(`
    SELECT sa.id, sa.role, sa.notes, sa.attended,
      s.id AS shift_id, s.date, s.start_time, s.end_time, s.task, s.notes AS shift_notes,
      s.tournament_id, tr.name AS tournament_name
    FROM shift_assignments sa
    JOIN shifts s ON sa.shift_id = s.id
    LEFT JOIN tournaments tr ON s.tournament_id = tr.id
    WHERE sa.helper_id = ?
    ORDER BY s.date, s.start_time
  `).all(session.helperId);
  return NextResponse.json(rows);
}
