import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { notifyShiftTeam } from "@/lib/notify";

// POST { shift_id } — Team-Mitglieder einer Schicht (erneut) benachrichtigen
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { shift_id } = await req.json();
  if (!shift_id) return NextResponse.json({ error: "shift_id fehlt" }, { status: 400 });
  const shift = getDb().prepare("SELECT tournament_id FROM shifts WHERE id = ?").get(Number(shift_id)) as { tournament_id: number | null } | undefined;
  if (!shift) return NextResponse.json({ error: "Schicht nicht gefunden" }, { status: 404 });
  if (!canManageTournament(session, shift.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  const result = await notifyShiftTeam(Number(shift_id));
  return NextResponse.json(result);
}
