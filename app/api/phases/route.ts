import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const db = getDb();
  const phases = db.prepare("SELECT * FROM custom_phases ORDER BY created_at ASC").all();
  return NextResponse.json(phases);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { label, color } = await req.json();
  if (!label?.trim()) return NextResponse.json({ error: "Label fehlt" }, { status: 400 });
  const key = label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!key) return NextResponse.json({ error: "Ungültiger Name" }, { status: 400 });
  const db = getDb();
  try {
    const r = db.prepare("INSERT INTO custom_phases (key, label, color) VALUES (?, ?, ?)").run(key, label.trim(), color || "#6366f1");
    return NextResponse.json(db.prepare("SELECT * FROM custom_phases WHERE id = ?").get(r.lastInsertRowid), { status: 201 });
  } catch {
    return NextResponse.json({ error: "Phase existiert bereits" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM custom_phases WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
