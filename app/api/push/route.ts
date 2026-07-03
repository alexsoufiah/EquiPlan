import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { initVapid, getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  initVapid();
  return NextResponse.json({ publicKey: getVapidPublicKey() });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const subscription = await req.json().catch(() => null);
  // endpoint ist NOT NULL/UNIQUE — ohne Validierung wirft der Bind einen 500 statt eines sauberen 400.
  if (!subscription || typeof subscription !== "object" || typeof subscription.endpoint !== "string") {
    return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO push_subscriptions (endpoint, subscription, role, team_id, speaker_id, helper_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      subscription.endpoint,
      JSON.stringify(subscription),
      session.role,
      session.teamId ?? null,
      session.speakerId ?? null,
      session.helperId ?? null,
    );
  } catch (e) {
    console.error("[push POST]", e);
    return NextResponse.json({ error: "Speichern fehlgeschlagen" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { endpoint } = await req.json();
  getDb().prepare("DELETE FROM push_subscriptions WHERE endpoint = ?").run(endpoint);
  return NextResponse.json({ ok: true });
}
