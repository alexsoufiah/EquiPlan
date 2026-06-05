import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(getDb().prepare("SELECT * FROM arenas ORDER BY name").all());
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, description } = await req.json();
  const result = getDb().prepare("INSERT INTO arenas (name, description) VALUES (?, ?)").run(name, description || null);
  return NextResponse.json(getDb().prepare("SELECT * FROM arenas WHERE id = ?").get(result.lastInsertRowid), { status: 201 });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id, name, description } = await req.json();
  getDb().prepare("UPDATE arenas SET name=?, description=? WHERE id=?").run(name, description || null, id);
  return NextResponse.json(getDb().prepare("SELECT * FROM arenas WHERE id = ?").get(id));
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM arenas WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
