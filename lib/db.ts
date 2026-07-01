import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// DB_PATH kann per Umgebungsvariable überschrieben werden (z.B. Railway-Volume)
const DB_DIR = process.env.DB_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "pferdeplan.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
    // Erst NACH den Migrationen aktivieren: die einmalige schedule_entries-Rebuild-
    // Migration läuft so ohne FK-Kaskaden; ab jetzt greifen ON DELETE CASCADE/SET NULL.
    db.pragma("foreign_keys = ON");
  }
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      start_date TEXT,
      end_date TEXT,
      share_token TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS speakers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#3B82F6',
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS arenas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      password_hash TEXT
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      title TEXT NOT NULL,
      phase TEXT NOT NULL,
      pruefungs_id TEXT,
      arena_id INTEGER REFERENCES arenas(id) ON DELETE SET NULL,
      team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
      speaker_id INTEGER REFERENCES speakers(id) ON DELETE SET NULL,
      notes TEXT,
      external_source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_entry_teams (
      entry_id INTEGER NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
      team_id  INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      PRIMARY KEY (entry_id, team_id)
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      subscription TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entry_id INTEGER,
      description TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
      entry_id INTEGER REFERENCES schedule_entries(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/pdf',
      size INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migrations
  const tournCols = (db.prepare("PRAGMA table_info(tournaments)").all() as { name: string }[]).map(c => c.name);
  if (!tournCols.includes("share_token")) db.exec("ALTER TABLE tournaments ADD COLUMN share_token TEXT");
  if (!tournCols.includes("logo_path")) db.exec("ALTER TABLE tournaments ADD COLUMN logo_path TEXT");
  if (!tournCols.includes("staff_token")) db.exec("ALTER TABLE tournaments ADD COLUMN staff_token TEXT");

  db.exec(`
    CREATE TABLE IF NOT EXISTS custom_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Verspätungen pro Turnier/Tag/Platz (arena_id = 0 => gilt für den ganzen Tag)
    CREATE TABLE IF NOT EXISTS arena_delays (
      tournament_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      arena_id INTEGER NOT NULL DEFAULT 0,
      minutes INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (tournament_id, date, arena_id)
    );

    -- Übersetzungs-Cache (DeepL), damit jede Phrase nur einmal übersetzt wird
    CREATE TABLE IF NOT EXISTS translations (
      source TEXT NOT NULL,
      target TEXT NOT NULL,
      translated TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source, target)
    );

    -- Telefonliste pro Turnier (Name, Rolle/Job, Telefonnummer)
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT,
      phone TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Zentrale Helferliste (Stammdaten + Account). E-Mail = eindeutige Kennung.
    CREATE TABLE IF NOT EXISTS helpers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Helfer ↔ Teams (Mehrfach-Zuordnung)
    CREATE TABLE IF NOT EXISTS team_members (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      helper_id INTEGER NOT NULL REFERENCES helpers(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, helper_id)
    );

    -- Bis zu 3 Verantwortliche pro Team (in der API begrenzt)
    CREATE TABLE IF NOT EXISTS team_leads (
      team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      helper_id INTEGER NOT NULL REFERENCES helpers(id) ON DELETE CASCADE,
      PRIMARY KEY (team_id, helper_id)
    );

    -- Benachrichtigungs-Protokoll (nachvollziehbar, was versendet wurde)
    CREATE TABLE IF NOT EXISTS notifications_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL,            -- 'credentials' | 'shift_assignment'
      helper_id INTEGER,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      context TEXT,                  -- JSON mit Schicht-/Team-/Event-Details
      status TEXT NOT NULL,          -- 'sent' | 'skipped' | 'failed'
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Push-Subscriptions: Ziel-Infos für gezielte Benachrichtigungen
  const subCols = (db.prepare("PRAGMA table_info(push_subscriptions)").all() as { name: string }[]).map(c => c.name);
  if (!subCols.includes("role")) db.exec("ALTER TABLE push_subscriptions ADD COLUMN role TEXT");
  if (!subCols.includes("team_id")) db.exec("ALTER TABLE push_subscriptions ADD COLUMN team_id INTEGER");
  if (!subCols.includes("speaker_id")) db.exec("ALTER TABLE push_subscriptions ADD COLUMN speaker_id INTEGER");

  const cols = (db.prepare("PRAGMA table_info(schedule_entries)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("pruefungs_id")) db.exec("ALTER TABLE schedule_entries ADD COLUMN pruefungs_id TEXT");
  if (!cols.includes("external_source")) db.exec("ALTER TABLE schedule_entries ADD COLUMN external_source TEXT");
  if (!cols.includes("tournament_id")) db.exec("ALTER TABLE schedule_entries ADD COLUMN tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE");

  const teamCols = (db.prepare("PRAGMA table_info(teams)").all() as { name: string }[]).map(c => c.name);
  if (!teamCols.includes("password_hash")) db.exec("ALTER TABLE teams ADD COLUMN password_hash TEXT");

  const speakerCols = (db.prepare("PRAGMA table_info(speakers)").all() as { name: string }[]).map(c => c.name);
  if (!speakerCols.includes("password_hash")) db.exec("ALTER TABLE speakers ADD COLUMN password_hash TEXT");

  const docCols = (db.prepare("PRAGMA table_info(documents)").all() as { name: string }[]).map(c => c.name);
  if (!docCols.includes("entry_id")) db.exec("ALTER TABLE documents ADD COLUMN entry_id INTEGER REFERENCES schedule_entries(id) ON DELETE CASCADE");

  const entryCols2 = (db.prepare("PRAGMA table_info(schedule_entries)").all() as { name: string }[]).map(c => c.name);
  if (!entryCols2.includes("helpers_needed")) db.exec("ALTER TABLE schedule_entries ADD COLUMN helpers_needed INTEGER NOT NULL DEFAULT 0");
  if (!entryCols2.includes("helpers_task")) db.exec("ALTER TABLE schedule_entries ADD COLUMN helpers_task TEXT");
  if (!entryCols2.includes("delay_minutes")) db.exec("ALTER TABLE schedule_entries ADD COLUMN delay_minutes INTEGER NOT NULL DEFAULT 0");

  // Alte CHECK-Beschränkung auf "phase" entfernen (ließ nur die 4 alten Phasen zu,
  // blockierte Siegerehrung + eigene Phasen). SQLite kann CHECK nicht per ALTER
  // entfernen -> Tabelle einmalig ohne die Beschränkung neu aufbauen.
  const seTableSql = (db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='schedule_entries'").get() as { sql: string } | undefined)?.sql;
  if (seTableSql && /CHECK\s*\(\s*phase/i.test(seTableSql)) {
    const colNames = (db.prepare("PRAGMA table_info(schedule_entries)").all() as { name: string }[]).map(c => c.name).join(", ");
    let newSql = seTableSql
      .replace(/CHECK\s*\(\s*phase[^)]*\)\s*\)/i, "")               // CHECK(phase IN (...)) entfernen
      .replace(/CREATE TABLE\s+(IF NOT EXISTS\s+)?"?schedule_entries"?/i, 'CREATE TABLE "schedule_entries_rebuild"');
    const rebuild = db.transaction(() => {
      db.exec(newSql);
      db.exec(`INSERT INTO schedule_entries_rebuild (${colNames}) SELECT ${colNames} FROM schedule_entries`);
      db.exec("DROP TABLE schedule_entries");
      db.exec('ALTER TABLE schedule_entries_rebuild RENAME TO schedule_entries');
    });
    rebuild();
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS shifts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      task TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS shift_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
      worker_name TEXT NOT NULL,
      attended INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS event_helpers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_id INTEGER NOT NULL REFERENCES schedule_entries(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      note TEXT,
      signed_up_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Helfer-Bezug auf Schicht-Zuweisungen (Dropdown statt Freitext)
  const saCols = (db.prepare("PRAGMA table_info(shift_assignments)").all() as { name: string }[]).map(c => c.name);
  if (!saCols.includes("helper_id")) db.exec("ALTER TABLE shift_assignments ADD COLUMN helper_id INTEGER REFERENCES helpers(id) ON DELETE SET NULL");
  // Arbeitsrolle je Zuweisung (Protokoll/Einlass/Tafel/…) – kann pro Schicht/Person verschieden sein
  if (!saCols.includes("role")) db.exec("ALTER TABLE shift_assignments ADD COLUMN role TEXT");
  // Klartext-Passwort, damit Admins die generierten Zugangsdaten ansehen können
  const helperCols = (db.prepare("PRAGMA table_info(helpers)").all() as { name: string }[]).map(c => c.name);
  if (!helperCols.includes("plain_password")) db.exec("ALTER TABLE helpers ADD COLUMN plain_password TEXT");
  // Push-Subscriptions: Helfer-Bezug für gezielte App-Benachrichtigungen
  const subCols2 = (db.prepare("PRAGMA table_info(push_subscriptions)").all() as { name: string }[]).map(c => c.name);
  if (!subCols2.includes("helper_id")) db.exec("ALTER TABLE push_subscriptions ADD COLUMN helper_id INTEGER");
  // Optionale Team-Zuweisung an eine Schicht (löst Benachrichtigung der Mitglieder aus)
  const shiftCols = (db.prepare("PRAGMA table_info(shifts)").all() as { name: string }[]).map(c => c.name);
  if (!shiftCols.includes("team_id")) db.exec("ALTER TABLE shifts ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL");

  if (cols.includes("team_id")) {
    const rows = db.prepare("SELECT id, team_id FROM schedule_entries WHERE team_id IS NOT NULL").all() as { id: number; team_id: number }[];
    const ins = db.prepare("INSERT OR IGNORE INTO schedule_entry_teams (entry_id, team_id) VALUES (?, ?)");
    for (const r of rows) ins.run(r.id, r.team_id);
    db.exec("UPDATE schedule_entries SET team_id = NULL WHERE team_id IS NOT NULL");
  }

  // Bestehende Einträge ohne Turnier einem Standard-Turnier zuweisen
  const orphans = (db.prepare("SELECT COUNT(*) as c FROM schedule_entries WHERE tournament_id IS NULL").get() as { c: number }).c;
  if (orphans > 0) {
    let defaultTournament = db.prepare("SELECT id FROM tournaments LIMIT 1").get() as { id: number } | undefined;
    if (!defaultTournament) {
      const r = db.prepare("INSERT INTO tournaments (name, location) VALUES (?, ?)").run("Standard-Turnier", "");
      defaultTournament = { id: Number(r.lastInsertRowid) };
    }
    db.prepare("UPDATE schedule_entries SET tournament_id = ? WHERE tournament_id IS NULL").run(defaultTournament.id);
  }

  // Seed defaults
  const arenaCount = (db.prepare("SELECT COUNT(*) as c FROM arenas").get() as { c: number }).c;
  if (arenaCount === 0) {
    db.prepare("INSERT INTO arenas (name, description) VALUES (?, ?)").run("Hauptplatz", "Hauptveranstaltungsplatz");
    db.prepare("INSERT INTO arenas (name, description) VALUES (?, ?)").run("Nebenplatz A", "Trainingsplatz");
    db.prepare("INSERT INTO arenas (name, description) VALUES (?, ?)").run("Nebenplatz B", "Aufwärmplatz");
  }

  const teamCount = (db.prepare("SELECT COUNT(*) as c FROM teams").get() as { c: number }).c;
  if (teamCount === 0) {
    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Aufbauteam");
    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Ordnerdienst");
    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Technik");
    db.prepare("INSERT INTO teams (name) VALUES (?)").run("Medizin");
  }
}

export { getDb };
