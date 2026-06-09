import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json();
  if (!name || !email) return NextResponse.json({ error: "Name und E-Mail erforderlich" }, { status: 400 });

  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS contact_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  db.prepare("INSERT INTO contact_inquiries (name, email, message) VALUES (?, ?, ?)").run(name, email, message || null);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = getDb();
  db.exec(`CREATE TABLE IF NOT EXISTS contact_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  return NextResponse.json(db.prepare("SELECT * FROM contact_inquiries ORDER BY created_at DESC").all());
}
