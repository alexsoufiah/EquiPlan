import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { shift_id, worker_name, notes } = await req.json();
  if (!shift_id || !worker_name) return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });

  const db = getDb();
  const result = db.prepare(
    "INSERT INTO shift_assignments (shift_id, worker_name, notes) VALUES (?, ?, ?)"
  ).run(shift_id, worker_name, notes ?? null);

  return NextResponse.json({ id: Number(result.lastInsertRowid) }, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id, attended, worker_name, notes } = await req.json();
  getDb().prepare(
    "UPDATE shift_assignments SET attended=?, worker_name=?, notes=? WHERE id=?"
  ).run(attended ?? 0, worker_name, notes ?? null, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const { id } = await req.json();
  getDb().prepare("DELETE FROM shift_assignments WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
