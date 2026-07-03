import { NextRequest, NextResponse } from "next/server";
import { getSession, canManageTournament } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DB_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
const LOGO_DIR = path.join(DB_DIR, "logos");

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (session?.role !== "admin") return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const tournamentId = formData.get("tournament_id") as string | null;

  if (!file || !tournamentId) return NextResponse.json({ error: "Fehlende Felder" }, { status: 400 });

  // tournament_id MUSS eine positive Ganzzahl sein — sonst landet der Rohwert (z. B. "../../..")
  // ungeprüft im Dateinamen und der Write bricht aus LOGO_DIR aus (Path Traversal).
  const tid = Number(tournamentId);
  if (!Number.isInteger(tid) || tid <= 0) return NextResponse.json({ error: "Ungültige Turnier-ID" }, { status: 400 });
  // Turnier-Scope: ein Show-Admin darf nur sein eigenes Turnier-Logo ändern.
  if (!canManageTournament(session, tid)) return NextResponse.json({ error: "Kein Zugriff auf dieses Turnier" }, { status: 403 });

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext ?? "")) {
    return NextResponse.json({ error: "Nur Bilder erlaubt (jpg, png, webp, gif)" }, { status: 400 });
  }

  await mkdir(LOGO_DIR, { recursive: true });
  const filename = `tournament_${tid}_${Date.now()}.${ext}`;
  const filepath = path.join(LOGO_DIR, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buf);

  const db = getDb();
  const old = db.prepare("SELECT logo_path FROM tournaments WHERE id = ?").get(tid) as { logo_path?: string } | undefined;
  if (old?.logo_path) {
    const oldBase = path.basename(old.logo_path);
    unlink(path.join(LOGO_DIR, oldBase)).catch(() => {});
  }

  const logoPath = `/api/tournaments/logo/${filename}`;
  db.prepare("UPDATE tournaments SET logo_path = ? WHERE id = ?").run(logoPath, tid);

  return NextResponse.json({ logo_path: logoPath }, { status: 201 });
}
