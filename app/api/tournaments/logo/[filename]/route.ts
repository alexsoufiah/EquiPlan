import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export const dynamic = "force-dynamic";

const DB_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
const LOGO_DIR = path.join(DB_DIR, "logos");

export async function GET(_req: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  // Prevent path traversal
  const safe = path.basename(filename);
  try {
    const buf = await readFile(path.join(LOGO_DIR, safe));
    const ext = safe.split(".").pop()?.toLowerCase();
    const ct = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(buf, { headers: { "Content-Type": ct, "Cache-Control": "public, max-age=31536000" } });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
