import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { sendEmail, generatePassword, credentialsEmailHtml } from "@/lib/email";

// Flexible Spalten-Erkennung (deutsch + englisch)
function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of Object.keys(row)) {
    const norm = k.toLowerCase().replace(/[\s._-]/g, "");
    if (keys.includes(norm)) return String(row[k] ?? "").trim();
  }
  return "";
}

// POST — Excel-Datei (multipart, Feld "file") importieren. Upsert per E-Mail.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Keine Datei" }, { status: 400 });

  let rows: Record<string, unknown>[];
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  } catch {
    return NextResponse.json({ error: "Datei konnte nicht gelesen werden (xlsx/csv erwartet)" }, { status: 400 });
  }

  const db = getDb();
  const findByEmail = db.prepare("SELECT id FROM helpers WHERE email = ? COLLATE NOCASE");
  const insert = db.prepare("INSERT INTO helpers (first_name, last_name, email, phone, password_hash) VALUES (?, ?, ?, ?, ?)");
  const update = db.prepare("UPDATE helpers SET first_name=?, last_name=?, phone=? WHERE id=?");

  let created = 0, updated = 0, mailed = 0, mailSkipped = 0;
  const errors: { row: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const first = pick(row, ["vorname", "firstname", "first", "prename"]);
    const last = pick(row, ["nachname", "lastname", "last", "surname", "name"]);
    const emailAddr = pick(row, ["email", "emailadresse", "emailaddress", "mail", "emailaddresse"]);
    const phone = pick(row, ["telefon", "telefonnummer", "phone", "tel", "mobil", "handy"]);

    if (!first || !last) { errors.push({ row: i + 2, error: "Vor-/Nachname fehlt" }); continue; }
    if (!/\S+@\S+\.\S+/.test(emailAddr)) { errors.push({ row: i + 2, error: `ungültige E-Mail: ${emailAddr || "(leer)"}` }); continue; }

    const existing = findByEmail.get(emailAddr) as { id: number } | undefined;
    if (existing) {
      update.run(first, last, phone || null, existing.id);
      updated++;
    } else {
      const password = generatePassword();
      const hash = await hashPassword(password);
      const r = insert.run(first, last, emailAddr, phone || null, hash);
      created++;
      const status = await sendEmail({ to: emailAddr, subject: "Willkommen bei EquiPlan – deine Zugangsdaten", html: credentialsEmailHtml(first, emailAddr, password), kind: "credentials", helperId: Number(r.lastInsertRowid) });
      if (status === "sent") mailed++; else mailSkipped++;
    }
  }

  return NextResponse.json({ created, updated, mailed, mailSkipped, errorCount: errors.length, errors: errors.slice(0, 20), total: rows.length });
}
