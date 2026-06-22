import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const t = getDb().prepare("SELECT id, name, location, start_date, end_date, share_token, staff_token, logo_path FROM tournaments WHERE id = ?").get(id);
  if (!t) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(t);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  if (!canManageTournament(session, id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, location, start_date, end_date } = await req.json();
  getDb().prepare("UPDATE tournaments SET name=?, location=?, start_date=?, end_date=? WHERE id=?")
    .run(name, location || null, start_date || null, end_date || null, id);
  return NextResponse.json(getDb().prepare("SELECT * FROM tournaments WHERE id = ?").get(id));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  if (!canManageTournament(session, id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const count = (getDb().prepare("SELECT COUNT(*) as c FROM schedule_entries WHERE tournament_id = ?").get(id) as { c: number }).c;
  if (count > 0) return NextResponse.json({ error: `Turnier hat noch ${count} Einträge. Bitte zuerst löschen.` }, { status: 400 });
  getDb().prepare("DELETE FROM tournaments WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
