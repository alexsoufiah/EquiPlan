import { getDb } from "./db";

// Key aus mehreren möglichen Variablennamen lesen (tolerant gegenüber Tippfehlern)
export function getDeeplKey(): string | undefined {
  const k = process.env.DEEPL_API_KEY || process.env.DEEPL_AUTH_KEY || process.env.DEEPL_KEY || process.env.DEEPL_TOKEN;
  return k?.trim() || undefined;
}

// DeepL-Übersetzung mit DB-Cache. Gibt für jede Eingabe die Übersetzung zurück
// (oder den Originaltext, falls kein Key gesetzt ist / DeepL fehlschlägt).
export async function translateTexts(texts: string[], target = "EN"): Promise<string[]> {
  const tgt = target.toUpperCase();
  const db = getDb();
  const result: string[] = new Array(texts.length);

  // 1) Cache prüfen
  const sel = db.prepare("SELECT translated FROM translations WHERE source = ? AND target = ?");
  const missing: { i: number; text: string }[] = [];
  texts.forEach((text, i) => {
    const trimmed = text;
    const row = sel.get(trimmed, tgt) as { translated: string } | undefined;
    if (row) result[i] = row.translated;
    else missing.push({ i, text: trimmed });
  });

  const key = getDeeplKey();
  if (missing.length === 0 || !key) {
    for (const m of missing) result[m.i] = m.text; // ohne Key: Original
    return result;
  }

  // DeepL Free-Keys enden auf ":fx" und nutzen die api-free-Domain
  const endpoint = key.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";

  const ins = db.prepare("INSERT OR REPLACE INTO translations (source, target, translated) VALUES (?, ?, ?)");

  // In Blöcken zu max. 50 Texten anfragen
  for (let start = 0; start < missing.length; start += 50) {
    const chunk = missing.slice(start, start + 50);
    const params = new URLSearchParams();
    params.set("target_lang", tgt);
    params.set("source_lang", "DE");
    params.set("preserve_formatting", "1");
    for (const m of chunk) params.append("text", m.text);

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `DeepL-Auth-Key ${key}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });
      if (!res.ok) { for (const m of chunk) result[m.i] = m.text; continue; }
      const data = (await res.json()) as { translations: { text: string }[] };
      chunk.forEach((m, k) => {
        const translated = data.translations[k]?.text ?? m.text;
        result[m.i] = translated;
        ins.run(m.text, tgt, translated);
      });
    } catch {
      for (const m of chunk) result[m.i] = m.text;
    }
  }
  return result;
}
