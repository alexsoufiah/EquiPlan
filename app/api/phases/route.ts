import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getDb();
  const custom = db.prepare("SELECT * FROM custom_phases ORDER BY created_at ASC").all();
  // Load standard phase color overrides from settings
  const overrides: Record<string, string> = {};
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'phase_color_%'").all() as { key: string; value: string }[];
  for (const r of rows) overrides[r.key.replace("phase_color_", "")] = r.value;
  return NextResponse.json({ custom, overrides });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const body = await req.json();
  const db = getDb();

  // Update standard phase color
  if (body.type === "override" && body.phase && body.color) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
      .run(`phase_color_${body.phase}`, body.color);
    return NextResponse.json({ ok: true });
  }

  // Create custom phase
  const { label, color } = body;
  if (!label?.trim()) return NextResponse.json({ error: "Label fehlt" }, { status: 400 });
  const key = label.trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  if (!key) return NextResponse.json({ error: "Ungültiger Name" }, { status: 400 });
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
