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

// GET /api/translate?debug=1 -> sichere Diagnose (zeigt NICHT den Key)
export async function GET(req: NextRequest) {
  if (new URL(req.url).searchParams.get("debug") !== "1") {
    return NextResponse.json({ ok: true });
  }
  const key = process.env.DEEPL_API_KEY?.trim();
  const info: Record<string, unknown> = {
    hasKey: !!key,
    keyLength: key?.length ?? 0,
    keyKind: key ? (key.endsWith(":fx") ? "free" : "pro") : null,
  };
  if (key) {
    const endpoint = key.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";
    info.endpoint = endpoint;
    try {
      const params = new URLSearchParams();
      params.set("target_lang", "EN");
      params.append("text", "Hallo Welt");
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `DeepL-Auth-Key ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: params,
      });
      info.deeplStatus = res.status;
      const body = await res.text();
      info.deeplBody = body.slice(0, 300);
    } catch (e) {
      info.fetchError = String(e);
    }
  }
  return NextResponse.json(info);
}
