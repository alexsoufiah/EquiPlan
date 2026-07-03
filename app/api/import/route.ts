import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getDb } from "@/lib/db";
import { sendPushNotification } from "@/lib/push";

// Drittanbieter authentifizieren sich über einen API-Key in der DB (settings.api_key)
function checkApiKey(req: NextRequest): boolean {
  const db = getDb();
  const stored = (db.prepare("SELECT value FROM settings WHERE key = 'api_key'").get() as { value: string } | undefined)?.value;
  if (!stored) return false;
  const provided = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("api_key");
  if (!provided || provided.length !== stored.length) return false; // Längen-Guard: timingSafeEqual wirft sonst
  return crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(stored)); // konstante Zeit statt ===
}

/**
 * POST /api/import
 * Importiert einen oder mehrere Zeitplan-Einträge von einem Drittanbieter.
 *
 * Header: x-api-key: <api-schluessel>
 *
 * Body (einzeln oder Array):
 * {
 *   "pruefungs_id": "P-2026-001",   // Pflicht – eindeutige ID des Drittanbieters
 *   "date": "2026-06-15",            // Pflicht – ISO-Datum
 *   "start_time": "09:00",           // Pflicht
 *   "end_time": "10:30",             // Pflicht
 *   "title": "Dressur Klasse A",     // Pflicht
 *   "phase": "wettkampf",            // Pflicht – aufbau|wettkampf|abbau|pause
 *   "arena_name": "Hauptplatz",      // Optional – wird per Name gesucht
 *   "team_name": "Ordnerdienst",     // Optional – wird per Name gesucht
 *   "notes": "...",                  // Optional
 *   "source": "FN-Portal"            // Optional – Name des Drittanbieters
 * }
 *
 * Verhalten: Existiert ein Eintrag mit derselben pruefungs_id bereits,
 * wird er aktualisiert (upsert). Sonst wird er neu angelegt.
 */
export async function POST(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Ungültiger API-Key" }, { status: 401 });
  }

  const db = getDb();
  const body = await req.json();
  const items: ImportEntry[] = Array.isArray(body) ? body : [body];

  const results: { pruefungs_id: string; action: string; id: number }[] = [];
  const errors: { pruefungs_id?: string; error: string }[] = [];

  for (const item of items) {
    try {
      if (!item.pruefungs_id || !item.date || !item.start_time || !item.end_time || !item.title || !item.phase) {
        errors.push({ pruefungs_id: item.pruefungs_id, error: "Pflichtfelder fehlen: pruefungs_id, date, start_time, end_time, title, phase" });
        continue;
      }

      const validPhases = ["aufbau", "wettkampf", "abbau", "pause"];
      if (!validPhases.includes(item.phase)) {
        errors.push({ pruefungs_id: item.pruefungs_id, error: `Ungültige Phase: ${item.phase}. Erlaubt: ${validPhases.join(", ")}` });
        continue;
      }

      // Platz per Name auflösen
      const arena = item.arena_name
        ? (db.prepare("SELECT id FROM arenas WHERE name = ? COLLATE NOCASE").get(item.arena_name) as { id: number } | undefined)
        : undefined;

      // Teams per Name auflösen (team_names als Array oder einzelner team_name)
      const teamNames: string[] = item.team_names ?? (item.team_name ? [item.team_name] : []);
      const teamIds: number[] = teamNames
        .map(n => (db.prepare("SELECT id FROM teams WHERE name = ? COLLATE NOCASE").get(n) as { id: number } | undefined)?.id)
        .filter((id): id is number => id !== undefined);

      const insTeam = db.prepare("INSERT OR IGNORE INTO schedule_entry_teams (entry_id, team_id) VALUES (?, ?)");

      const existing = db.prepare("SELECT id FROM schedule_entries WHERE pruefungs_id = ?").get(item.pruefungs_id) as { id: number } | undefined;

      if (existing) {
        db.prepare(`
          UPDATE schedule_entries SET
            date=?, start_time=?, end_time=?, title=?, phase=?,
            arena_id=?, notes=?, external_source=?,
            updated_at=datetime('now')
          WHERE pruefungs_id=?
        `).run(item.date, item.start_time, item.end_time, item.title, item.phase,
          arena?.id ?? null, item.notes ?? null, item.source ?? null, item.pruefungs_id);

        db.prepare("DELETE FROM schedule_entry_teams WHERE entry_id = ?").run(existing.id);
        for (const tid of teamIds) insTeam.run(existing.id, tid);

        db.prepare("INSERT INTO change_log (action, entry_id, description) VALUES (?, ?, ?)").run(
          "import-update", existing.id, `Import aktualisiert [${item.source ?? "extern"}]: ${item.title}`
        );
        results.push({ pruefungs_id: item.pruefungs_id, action: "updated", id: existing.id });
      } else {
        const r = db.prepare(`
          INSERT INTO schedule_entries (date, start_time, end_time, title, phase, pruefungs_id, arena_id, notes, external_source)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(item.date, item.start_time, item.end_time, item.title, item.phase,
          item.pruefungs_id, arena?.id ?? null, item.notes ?? null, item.source ?? null);

        for (const tid of teamIds) insTeam.run(r.lastInsertRowid, tid);

        db.prepare("INSERT INTO change_log (action, entry_id, description) VALUES (?, ?, ?)").run(
          "import-create", r.lastInsertRowid, `Import neu [${item.source ?? "extern"}]: ${item.title}`
        );
        results.push({ pruefungs_id: item.pruefungs_id, action: "created", id: Number(r.lastInsertRowid) });
      }
    } catch (e) {
      console.error("[import]", item.pruefungs_id, e);
      errors.push({ pruefungs_id: item.pruefungs_id, error: "Import fehlgeschlagen" });
    }
  }

  if (results.length > 0) {
    await sendPushNotification(
      "Zeitplan importiert",
      `${results.length} Eintrag/Einträge von extern aktualisiert`
    );
  }

  return NextResponse.json({ imported: results.length, errorCount: errors.length, results, errors }, {
    status: errors.length > 0 && results.length === 0 ? 400 : 200
  });
}

/**
 * GET /api/import?api_key=...
 * Gibt alle importierten Einträge zurück (gefiltert nach external_source).
 */
export async function GET(req: NextRequest) {
  if (!checkApiKey(req)) {
    return NextResponse.json({ error: "Ungültiger API-Key" }, { status: 401 });
  }

  const db = getDb();
  const { searchParams } = new URL(req.url);
  const source = searchParams.get("source");

  const entries = source
    ? db.prepare("SELECT * FROM schedule_entries WHERE external_source = ? ORDER BY date, start_time").all(source)
    : db.prepare("SELECT * FROM schedule_entries WHERE external_source IS NOT NULL ORDER BY date, start_time").all();

  return NextResponse.json(entries);
}

interface ImportEntry {
  pruefungs_id: string;
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  phase: string;
  arena_name?: string;
  team_name?: string;
  team_names?: string[];
  notes?: string;
  source?: string;
}
