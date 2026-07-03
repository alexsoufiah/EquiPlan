import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession, canManageTournament } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

const DB_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DB_DIR, "uploads");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Dokumente sind (wie die Liste/Upload/Delete in ../route.ts) ausschließlich Admin-Ressourcen.
  // Ohne diese Sperre könnte jede eingeloggte Rolle jedes PDF per fortlaufender id abrufen.
  const session = await verifySession(req);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });

  const { id } = await params;
  const db = getDb();
  const doc = db.prepare("SELECT filename, original_name, mime_type, tournament_id, entry_id FROM documents WHERE id = ?").get(Number(id)) as
    | { filename: string; original_name: string; mime_type: string; tournament_id: number | null; entry_id: number | null }
    | undefined;

  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Turnier-Scope für Show-Admins erzwingen
  let effectiveTournamentId = doc.tournament_id;
  if (doc.entry_id != null && effectiveTournamentId == null) {
    const entry = db.prepare("SELECT tournament_id FROM schedule_entries WHERE id = ?").get(doc.entry_id) as { tournament_id: number } | undefined;
    effectiveTournamentId = entry?.tournament_id ?? null;
  }
  if (effectiveTournamentId != null && !canManageTournament(session, effectiveTournamentId)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  if (effectiveTournamentId == null && session.adminTournamentId != null) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  try {
    const buffer = await readFile(path.join(UPLOAD_DIR, doc.filename));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }
}
