import crypto from "crypto";
import { getDb } from "./db";

// Absender: per RESEND_FROM überschreibbar, sonst Resend-Sandbox (nur an Konto-Adresse).
const FROM = process.env.RESEND_FROM || "EquiPlan <onboarding@resend.dev>";

export type MailStatus = "sent" | "skipped" | "failed";

// Verschickt eine E-Mail über Resend und protokolliert das Ergebnis.
// Ohne RESEND_API_KEY wird sauber übersprungen (status "skipped").
export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  kind: string;
  helperId?: number | null;
  context?: Record<string, unknown>;
}): Promise<MailStatus> {
  const apiKey = process.env.RESEND_API_KEY;
  let status: MailStatus = "skipped";
  let detail = "";

  if (!apiKey) {
    detail = "kein RESEND_API_KEY gesetzt";
  } else if (!opts.to || !/\S+@\S+\.\S+/.test(opts.to)) {
    status = "failed";
    detail = "ungültige Empfängeradresse";
  } else {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM, to: [opts.to], subject: opts.subject, html: opts.html }),
      });
      if (res.ok) status = "sent";
      else { status = "failed"; detail = `HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`; }
    } catch (e) {
      status = "failed";
      detail = String(e);
    }
  }

  try {
    getDb().prepare(
      "INSERT INTO notifications_log (kind, helper_id, email, subject, context, status, detail) VALUES (?, ?, ?, ?, ?, ?, ?)"
    ).run(opts.kind, opts.helperId ?? null, opts.to, opts.subject, opts.context ? JSON.stringify(opts.context) : null, status, detail || null);
  } catch { /* Protokoll-Fehler nicht eskalieren */ }

  return status;
}

// Leicht lesbares Zufallspasswort (ohne verwechselbare Zeichen).
export function generatePassword(len = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

const APP_URL = process.env.APP_URL || "https://equiplan-production.up.railway.app";

// HTML für die Zugangsdaten-E-Mail an einen neuen Helfer.
export function credentialsEmailHtml(firstName: string, email: string, password: string): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#4f46e5">Willkommen bei EquiPlan, ${firstName}!</h2>
      <p>Du wurdest als Helfer angelegt. Mit diesen Zugangsdaten kannst du dich anmelden:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 12px;color:#6b7280">E-Mail</td><td style="padding:6px 12px;font-weight:bold">${email}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Passwort</td><td style="padding:6px 12px;font-weight:bold;font-family:monospace">${password}</td></tr>
      </table>
      <p><a href="${APP_URL}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Zur Anmeldung →</a></p>
      <p style="color:#6b7280;font-size:13px">Melde dich mit deiner E-Mail-Adresse und dem Passwort an. Du kannst das Passwort bei der Veranstaltungsleitung ändern lassen.</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#9ca3af;font-size:12px">EquiPlan · Turnierplanung</p>
    </div>`;
}

// HTML für die Schicht-/Aufgaben-Benachrichtigung an ein Team-Mitglied.
export function shiftEmailHtml(opts: {
  firstName: string; event: string; task: string; date: string; time: string; responsible: string; teamName: string;
}): string {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;color:#1f2937">
      <h2 style="color:#4f46e5">Neue Einteilung für dich, ${opts.firstName}</h2>
      <p>Dein Team <strong>${opts.teamName}</strong> wurde für eine Schicht/Aufgabe eingeteilt:</p>
      <table style="border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 12px;color:#6b7280">Veranstaltung</td><td style="padding:6px 12px;font-weight:bold">${opts.event || "—"}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Aufgabe / Schicht</td><td style="padding:6px 12px;font-weight:bold">${opts.task}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Datum</td><td style="padding:6px 12px;font-weight:bold">${opts.date}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Uhrzeit</td><td style="padding:6px 12px;font-weight:bold">${opts.time}</td></tr>
        <tr><td style="padding:6px 12px;color:#6b7280">Ansprechpartner</td><td style="padding:6px 12px;font-weight:bold">${opts.responsible || "—"}</td></tr>
      </table>
      <p><a href="${APP_URL}" style="background:#4f46e5;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Zum Zeitplan →</a></p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0">
      <p style="color:#9ca3af;font-size:12px">EquiPlan · Turnierplanung</p>
    </div>`;
}
