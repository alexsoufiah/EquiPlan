import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getDb } from "@/lib/db";

// GET ?team_id= → { members: number[], leads: number[] } (Helfer-IDs)
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const teamId = Number(new URL(req.url).searchParams.get("team_id"));
  if (!teamId) return NextResponse.json({ members: [], leads: [] });
  const db = getDb();
  const members = (db.prepare("SELECT helper_id FROM team_members WHERE team_id = ?").all(teamId) as { helper_id: number }[]).map(r => r.helper_id);
  const leads = (db.prepare("SELECT helper_id FROM team_leads WHERE team_id = ?").all(teamId) as { helper_id: number }[]).map(r => r.helper_id);
  return NextResponse.json({ members, leads });
}

// POST { team_id, member_ids: number[], lead_ids: number[] } → ersetzt Mitglieder + Verantwortliche.
// Verantwortliche: max. 3, nur aus der zentralen Helferliste.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { team_id, member_ids, lead_ids } = await req.json();
  if (!team_id) return NextResponse.json({ error: "team_id fehlt" }, { status: 400 });

  const db = getDb();
  const valid = new Set((db.prepare("SELECT id FROM helpers").all() as { id: number }[]).map(r => r.id));
  const members = Array.isArray(member_ids) ? [...new Set(member_ids.map(Number))].filter(id => valid.has(id)) : [];
  const leads = (Array.isArray(lead_ids) ? [...new Set(lead_ids.map(Number))].filter(id => valid.has(id)) : []).slice(0, 3);

  const tx = db.transaction(() => {
    db.prepare("DELETE FROM team_members WHERE team_id = ?").run(team_id);
    db.prepare("DELETE FROM team_leads WHERE team_id = ?").run(team_id);
    const im = db.prepare("INSERT OR IGNORE INTO team_members (team_id, helper_id) VALUES (?, ?)");
    const il = db.prepare("INSERT OR IGNORE INTO team_leads (team_id, helper_id) VALUES (?, ?)");
    for (const h of members) im.run(team_id, h);
    for (const h of leads) il.run(team_id, h);
  });
  tx();

  return NextResponse.json({ ok: true, members, leads });
}
