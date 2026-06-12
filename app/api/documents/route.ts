import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import { writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const db = getDb();
  const tournamentId = req.nextUrl.searchParams.get("tournament_id");
  const entryId = req.nextUrl.searchParams.get("entry_id");
  const scope = req.nextUrl.searchParams.get("scope"); // "general" = no tournament, no entry

  let docs;
  if (entryId) {
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE entry_id = ? ORDER BY uploaded_at DESC").all(Number(entryId));
  } else if (scope === "general") {
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE tournament_id IS NULL AND entry_id IS NULL ORDER BY uploaded_at DESC").all();
  } else if (tournamentId) {
    docs = db.prepare("SELECT id, tournament_id, entry_id, original_name, size, uploaded_at FROM documents WHERE tournament_id = ? AND entry_id IS NULL ORDER BY uploaded_at DESC").all(Number(tournamentId));
  } else {
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

  const filename = randomBytes(16).toString("hex") + ".pdf";
  const filePath = path.join(UPLOAD_DIR, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filePath, buffer);

  const db = getDb();
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
  const doc = db.prepare("SELECT filename FROM documents WHERE id = ?").get(id) as { filename: string } | undefined;
  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  try {
    const { unlink } = await import("fs/promises");
    await unlink(path.join(UPLOAD_DIR, doc.filename));
  } catch {
    // ignore missing file
  }
  db.prepare("DELETE FROM documents WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
