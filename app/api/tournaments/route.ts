import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tournaments = getDb().prepare("SELECT * FROM tournaments ORDER BY start_date DESC, created_at DESC").all();
  return NextResponse.json(tournaments);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { name, location, start_date, end_date } = await req.json();
  const result = getDb().prepare(
    "INSERT INTO tournaments (name, location, start_date, end_date) VALUES (?, ?, ?, ?)"
  ).run(name, location || null, start_date || null, end_date || null);
  return NextResponse.json(getDb().prepare("SELECT * FROM tournaments WHERE id = ?").get(result.lastInsertRowid), { status: 201 });
}
