import { NextRequest, NextResponse } from "next/server";
import { translateTexts } from "@/lib/translate";

// Der Endpunkt ist bewusst ohne Session erreichbar (öffentliches Share-Board nutzt den
// DOM-Übersetzer). Damit ein anonymer Aufrufer aber nicht das kostenpflichtige DeepL-Kontingent
// leerlaufen lassen (oder die translations-Tabelle vollmüllen) kann: einfacher In-Memory-Limiter
// pro IP + Zeichen-Deckel pro Request. Setzt sich bei jedem Neustart zurück.
const RL = new Map<string, { count: number; resetAt: number }>();
const RL_MAX = 60;                 // max. 60 Requests
const RL_WINDOW_MS = 60 * 1000;    // pro Minute pro IP
const MAX_CHARS = 8000;            // Gesamtzeichen pro Request

function clientIp(req: NextRequest): string {
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const e = RL.get(ip);
  if (!e || now > e.resetAt) { RL.set(ip, { count: 1, resetAt: now + RL_WINDOW_MS }); return false; }
  e.count++;
  return e.count > RL_MAX;
}

// POST { texts: string[], target?: "EN" } -> { translations: string[] }
export async function POST(req: NextRequest) {
  if (rateLimited(clientIp(req))) {
    return NextResponse.json({ error: "Zu viele Anfragen" }, { status: 429, headers: { "Retry-After": "60" } });
  }
  const { texts, target } = await req.json();
  if (!Array.isArray(texts)) return NextResponse.json({ error: "texts erwartet" }, { status: 400 });
  let total = 0;
  const clean: string[] = [];
  for (const t of texts.slice(0, 200)) {
    const s = String(t ?? "");
    if (total + s.length > MAX_CHARS) break; // Zeichen-Deckel: Rest verwerfen statt weiter an DeepL zu schicken
    total += s.length;
    clean.push(s);
  }
  const translations = await translateTexts(clean, target || "EN");
  return NextResponse.json({ translations });
}
