import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import crypto from "crypto";

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = getDb();
  const apiKey = (db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string } | undefined)?.value ?? null;
  return NextResponse.json({ apiKey });
}

export async function POST() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const db = getDb();
  const newKey = crypto.randomBytes(32).toString("hex");
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('api_key', ?)").run(newKey);
  return NextResponse.json({ apiKey: newKey });
}

export async function DELETE() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  getDb().prepare("DELETE FROM settings WHERE key = 'api_key'").run();
  return NextResponse.json({ ok: true });
}
