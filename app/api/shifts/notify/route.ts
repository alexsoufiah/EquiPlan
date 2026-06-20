import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { notifyShiftTeam } from "@/lib/notify";

// POST { shift_id } — Team-Mitglieder einer Schicht (erneut) benachrichtigen
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  const { shift_id } = await req.json();
  if (!shift_id) return NextResponse.json({ error: "shift_id fehlt" }, { status: 400 });
  const result = await notifyShiftTeam(Number(shift_id));
  return NextResponse.json(result);
}
