import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET — Versand-Protokoll (nachvollziehbar, was gesendet wurde), nur Admin
export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const rows = getDb().prepare(
    "SELECT id, kind, email, subject, status, detail, created_at FROM notifications_log ORDER BY created_at DESC, id DESC LIMIT 300"
  ).all();
  return NextResponse.json(rows);
}
