import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";

// GET — Login-Daten aller Helfer (E-Mail + entschlüsseltes Passwort), nur Admin,
// nur auf Anfrage (für den Login-Export). Passwörter liegen verschlüsselt in der DB.
export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const rows = getDb().prepare(
    "SELECT first_name, last_name, email, plain_password FROM helpers ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE"
  ).all() as { first_name: string; last_name: string; email: string; plain_password: string | null }[];
  return NextResponse.json(rows.map(r => ({
    first_name: r.first_name, last_name: r.last_name, email: r.email, password: decryptSecret(r.plain_password),
  })));
}
