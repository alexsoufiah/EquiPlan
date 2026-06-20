import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET ?id= — generiertes Klartext-Passwort eines Helfers (nur Admin, nur auf Anfrage)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  const row = getDb().prepare("SELECT plain_password FROM helpers WHERE id = ?").get(id) as { plain_password: string | null } | undefined;
  if (!row) return NextResponse.json({ error: "Helfer nicht gefunden" }, { status: 404 });
  return NextResponse.json({ password: row.plain_password });
}
