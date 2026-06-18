import { NextRequest, NextResponse } from "next/server";
import { translateTexts } from "@/lib/translate";

// POST { texts: string[], target?: "EN" } -> { translations: string[] }
export async function POST(req: NextRequest) {
  const { texts, target } = await req.json();
  if (!Array.isArray(texts)) return NextResponse.json({ error: "texts erwartet" }, { status: 400 });
  const clean = texts.map(t => String(t ?? "")).slice(0, 200);
  const translations = await translateTexts(clean, target || "EN");
  return NextResponse.json({ translations });
}
