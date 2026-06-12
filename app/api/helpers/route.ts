import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/auth";

// GET /api/helpers?entry_id=X  — admin sees helpers for an entry
export async function GET(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || (session.role !== "admin" && session.role !== "viewer")) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });
  }
  const entryId = req.nextUrl.searchParams.get("entry_id");
  if (!entryId) return NextResponse.json({ error: "entry_id fehlt" }, { status: 400 });

  const db = getDb();
  const helpers = db.prepare(
    "SELECT id, name, contact, note, signed_up_at FROM event_helpers WHERE entry_id = ? ORDER BY signed_up_at ASC"
  ).all(Number(entryId));
  return NextResponse.json(helpers);
}

// POST /api/helpers  — public signup via share token
// Body: { entry_id, share_token, name, contact, note? }
export async function POST(req: NextRequest) {
  const db = getDb();
  const body = await req.json();
  const { entry_id, share_token, name, contact, note } = body;

  if (!entry_id || !share_token || !name?.trim() || !contact?.trim()) {
    return NextResponse.json({ error: "Pflichtfelder: entry_id, share_token, name, contact" }, { status: 400 });
  }

  // Validate share_token belongs to the tournament of this entry
  const entry = db.prepare(`
    SELECT se.id, se.helpers_needed, t.share_token
    FROM schedule_entries se
    JOIN tournaments t ON t.id = se.tournament_id
    WHERE se.id = ?
  `).get(Number(entry_id)) as { id: number; helpers_needed: number; share_token: string } | undefined;

  if (!entry) return NextResponse.json({ error: "Event nicht gefunden" }, { status: 404 });
  if (entry.share_token !== share_token) return NextResponse.json({ error: "Ungültiger Link" }, { status: 403 });
  if (!entry.helpers_needed || entry.helpers_needed <= 0) return NextResponse.json({ error: "Für dieses Event werden keine Helfer benötigt" }, { status: 400 });

  const currentCount = (db.prepare("SELECT COUNT(*) as c FROM event_helpers WHERE entry_id = ?").get(Number(entry_id)) as { c: number }).c;
  if (currentCount >= entry.helpers_needed) {
    return NextResponse.json({ error: "Alle Helferplätze sind bereits belegt" }, { status: 409 });
  }

  const result = db.prepare(
    "INSERT INTO event_helpers (entry_id, name, contact, note) VALUES (?, ?, ?, ?)"
  ).run(Number(entry_id), name.trim(), contact.trim(), note?.trim() || null);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

// DELETE /api/helpers  — admin removes a helper
export async function DELETE(req: NextRequest) {
  const session = await verifySession(req);
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Nur Admins" }, { status: 403 });
  }
  const { id } = await req.json();
  getDb().prepare("DELETE FROM event_helpers WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
