import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getSession } from "@/lib/auth";

const NOTIFY_EMAIL = "alexsoufiah@gmail.com";

function ensureTable() {
  getDb().exec(`CREATE TABLE IF NOT EXISTS contact_inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);
}

async function sendEmail(name: string, email: string, message: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return; // Kein API-Key gesetzt → still überspringen

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "EquiPlan <onboarding@resend.dev>",
      to: [NOTIFY_EMAIL],
      subject: `Neue Anfrage von ${name}`,
      html: `
        <h2>Neue Kontaktanfrage über EquiPlan</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>E-Mail:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Nachricht:</strong><br>${message || "—"}</p>
        <hr>
        <p style="color:#888;font-size:12px">Gesendet über equiplan-production.up.railway.app</p>
      `,
    }),
  });
}

export async function POST(req: NextRequest) {
  const { name, email, message } = await req.json();
  if (!name || !email) return NextResponse.json({ error: "Name und E-Mail erforderlich" }, { status: 400 });

  ensureTable();
  getDb().prepare("INSERT INTO contact_inquiries (name, email, message) VALUES (?, ?, ?)").run(name, email, message || null);

  // E-Mail senden (Fehler stiller ignorieren — Anfrage trotzdem gespeichert)
  try { await sendEmail(name, email, message || ""); } catch { /* ignore */ }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  ensureTable();
  return NextResponse.json(getDb().prepare("SELECT * FROM contact_inquiries ORDER BY created_at DESC").all());
}
