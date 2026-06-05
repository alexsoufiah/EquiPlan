import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = getDb().prepare("SELECT * FROM change_log ORDER BY created_at DESC LIMIT 50").all();
  return NextResponse.json(entries);
}
