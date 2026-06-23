import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession, canManageTournament } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

const DB_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(DB_DIR, "uploads");

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });

  const db = getDb();
  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  const entryId = req.nextUrl.searchParams.get("entry_id");
  const scope = req.nextUrl.searchParams.get("scope"); // "general" = no tournament, no entry

  let docs;
  if (entryId) {
    // Turnier des Eintrags ermitteln und prüfen
    const entry = db.prepare("SELECT tournament_id FROM schedule_entries WHERE id = ?").get(Number(entryId)) as { tournament_id: number } | undefined;
    if (entry && !canManageTournament(session, entry.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE entry_id = ? ORDER BY uploaded_at DESC").all(Number(entryId));
  } else if (scope === "general") {
    // Turnierneutrale Dokumente: nur Super-Admins
    if (session.adminTournamentId != null) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE tournament_id IS NULL AND entry_id IS NULL ORDER BY uploaded_at DESC").all();
  } else if (tournamentId) {
    if (!canManageTournament(session, tournamentId)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE tournament_id = ? AND entry_id IS NULL ORDER BY uploaded_at DESC").all(Number(tournamentId));
  } else {
    // Kein Filter: nur Super-Admins dürfen alle Dokumente sehen
    if (session.adminTournamentId != null) return NextResponse.json({ error: "tournament_id erforderlich" }, { status: 400 });
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents ORDER BY uploaded_at DESC").all();
  }

  return NextResponse.json(docs);
}

export async function POST(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nur Admins können Dateien hochladen" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tournamentId = formData.get("tournament_id");
  const entryId = formData.get("entry_id");

  if (!file) return NextResponse.json({ error: "Keine Datei" }, { status: 400 });
  if (file.type !== "application/pdf") return NextResponse.json({ error: "Nur PDF-Dateien erlaubt" }, { status: 400 });
  if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: "Datei zu groß (max. 20 MB)" }, { status: 400 });

  const db = getDb();
  // Scope-Check vor dem Speichern
  if (entryId) {
    const entry = db.prepare("SELECT tournament_id FROM schedule_entries WHERE id = ?").get(Number(entryId)) as { tournament_id: number } | undefined;
    if (!entry || !canManageTournament(session, entry.tournament_id)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  } else if (tournamentId) {
    if (!canManageTournament(session, String(tournamentId))) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  } else if (session.adminTournamentId != null) {
    // Turnierneutrale Uploads: nur Super-Admins
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const filename = randomBytes(16).toString("hex") + ".pdf";
  const filePath = path.join(UPLOAD_DIR, filename);

  await mkdir(UPLOAD_DIR, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const result = db.prepare(
    "INSERT INTO documents (tournament_id, entry_id, filename, original_name, mime_type, size) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    tournamentId ? Number(tournamentId) : null,
    entryId ? Number(entryId) : null,
    filename, file.name, file.type, file.size
  );

  return NextResponse.json({ id: Number(result.lastInsertRowid), original_name: file.name }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nur Admins können Dateien löschen" }, { status: 403 });
  }

  const { id } = await req.json();
  const db = getDb();
  const doc = db.prepare("SELECT filename, tournament_id, entry_id FROM documents WHERE id = ?").get(id) as { filename: string; tournament_id: number | null; entry_id: number | null } | undefined;
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  // Effektive tournament_id ermitteln (ggf. über schedule_entries bei entry-gebundenen Dokumenten)
  let effectiveTournamentId = doc.tournament_id;
  if (doc.entry_id != null && effectiveTournamentId == null) {
    const entry = db.prepare("SELECT tournament_id FROM schedule_entries WHERE id = ?").get(doc.entry_id) as { tournament_id: number } | undefined;
    effectiveTournamentId = entry?.tournament_id ?? null;
  }
  if (effectiveTournamentId != null && !canManageTournament(session, effectiveTournamentId)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });
  if (effectiveTournamentId == null && session.adminTournamentId != null) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });

  try {
    const { unlink } = await import("fs/promises");
    await unlink(path.join(UPLOAD_DIR, doc.filename));
  } catch {
    // ignore missing file
  }
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
