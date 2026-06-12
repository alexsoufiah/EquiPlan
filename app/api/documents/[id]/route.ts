import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifySession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "data", "uploads");

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySession(req);
  if (!session) return NextResponse.json({ error: "Nicht autorisiert" }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const doc = db.prepare("SELECT filename, original_name, mime_type FROM documents WHERE id = ?").get(Number(id)) as
    | { filename: string; original_name: string; mime_type: string }
    | undefined;

  if (!doc) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  try {
    const buffer = await readFile(path.join(UPLOAD_DIR, doc.filename));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": doc.mime_type,
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.original_name)}"`,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "Datei nicht gefunden" }, { status: 404 });
  }
}
