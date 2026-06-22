import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";
import crypto from "crypto";

// Interner Staff-Link (mit Telefonliste) – nur Admin des jeweiligen Turniers
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  if (!canManageTournament(session, id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const token = crypto.randomBytes(16).toString("hex");
  getDb().prepare("UPDATE tournaments SET staff_token = ? WHERE id = ?").run(token, id);
  return NextResponse.json({ token });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  const { id } = await params;
  if (!canManageTournament(session, id)) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  getDb().prepare("UPDATE tournaments SET staff_token = NULL WHERE id = ?").run(id);
  return NextResponse.json({ ok: true });
}
