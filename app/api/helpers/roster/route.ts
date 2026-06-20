import { NextRequest, NextResponse } from "next/server";
import { getSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail, generatePassword, credentialsEmailHtml } from "@/lib/email";

// GET — komplette Helferliste (mit Team-Anzahl), nur Admin
export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = getDb();
  const rows = db.prepare(`
    SELECT h.id, h.first_name, h.last_name, h.email, h.phone, h.created_at,
      (h.password_hash IS NOT NULL) AS has_account,
      (SELECT COUNT(*) FROM team_members tm WHERE tm.helper_id = h.id) AS team_count
    FROM helpers h ORDER BY h.last_name COLLATE NOCASE, h.first_name COLLATE NOCASE
  `).all();
  return NextResponse.json(rows);
}

// POST — neuen Helfer anlegen (+ Passwort generieren + Zugangs-Mail), nur Admin.
// body.action === "reset": Passwort neu erzeugen und Zugangs-Mail erneut senden.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = getDb();
  const body = await req.json();

  // Passwort zurücksetzen / Zugangsdaten erneut senden
  if (body.action === "reset" && body.id) {
    const h = db.prepare("SELECT id, first_name, email FROM helpers WHERE id = ?").get(body.id) as { id: number; first_name: string; email: string } | undefined;
    if (!h) return NextResponse.json({ error: "Helfer nicht gefunden" }, { status: 404 });
    const password = generatePassword();
    db.prepare("UPDATE helpers SET password_hash = ?, plain_password = ? WHERE id = ?").run(await hashPassword(password), password, h.id);
    const status = await sendEmail({ to: h.email, subject: "Deine neuen EquiPlan-Zugangsdaten", html: credentialsEmailHtml(h.first_name, h.email, password), kind: "credentials", helperId: h.id });
    return NextResponse.json({ ok: true, emailStatus: status });
  }

  const first_name = (body.first_name ?? "").trim();
  const last_name = (body.last_name ?? "").trim();
  const emailAddr = (body.email ?? "").trim();
  const phone = (body.phone ?? "").trim();
  if (!first_name || !last_name) return NextResponse.json({ error: "Vor- und Nachname sind Pflicht" }, { status: 400 });
  if (!/\S+@\S+\.\S+/.test(emailAddr)) return NextResponse.json({ error: "Gültige E-Mail-Adresse ist Pflicht" }, { status: 400 });

  const exists = db.prepare("SELECT id FROM helpers WHERE email = ? COLLATE NOCASE").get(emailAddr);
  if (exists) return NextResponse.json({ error: "E-Mail-Adresse existiert bereits" }, { status: 409 });

  const password = generatePassword();
  const hash = await hashPassword(password);
  const r = db.prepare("INSERT INTO helpers (first_name, last_name, email, phone, password_hash, plain_password) VALUES (?, ?, ?, ?, ?, ?)")
    .run(first_name, last_name, emailAddr, phone || null, hash, password);
  const emailStatus = await sendEmail({ to: emailAddr, subject: "Willkommen bei EquiPlan – deine Zugangsdaten", html: credentialsEmailHtml(first_name, emailAddr, password), kind: "credentials", helperId: Number(r.lastInsertRowid) });

  const created = db.prepare("SELECT id, first_name, last_name, email, phone, created_at FROM helpers WHERE id = ?").get(r.lastInsertRowid);
  return NextResponse.json({ ...(created as object), emailStatus }, { status: 201 });
}

// PUT — Stammdaten ändern (kein Passwort), nur Admin
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const db = getDb();
  const { id, first_name, last_name, email, phone } = await req.json();
  if (!id) return NextResponse.json({ error: "id fehlt" }, { status: 400 });
  if (!first_name?.trim() || !last_name?.trim()) return NextResponse.json({ error: "Vor- und Nachname sind Pflicht" }, { status: 400 });
  if (!/\S+@\S+\.\S+/.test((email ?? "").trim())) return NextResponse.json({ error: "Gültige E-Mail-Adresse ist Pflicht" }, { status: 400 });
  const dup = db.prepare("SELECT id FROM helpers WHERE email = ? COLLATE NOCASE AND id <> ?").get(email.trim(), id);
  if (dup) return NextResponse.json({ error: "E-Mail-Adresse existiert bereits" }, { status: 409 });
  db.prepare("UPDATE helpers SET first_name=?, last_name=?, email=?, phone=? WHERE id=?")
    .run(first_name.trim(), last_name.trim(), email.trim(), (phone ?? "").trim() || null, id);
  return NextResponse.json(db.prepare("SELECT id, first_name, last_name, email, phone, created_at FROM helpers WHERE id = ?").get(id));
}

// DELETE — Helfer entfernen, nur Admin
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { id } = await req.json();
  getDb().prepare("DELETE FROM helpers WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
