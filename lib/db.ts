import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "pferdeplan.db");

let db: Database.Database;

function getDb(): Database.Database {
  if (!db) {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    initSchema(db);
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
      phase TEXT NOT NULL CHECK(phase IN ('aufbau','wettkampf','abbau','pause')),
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
  `);

  // Migrations
  const tournCols = (db.prepare("PRAGMA table_info(tournaments)").all() as { name: string }[]).map(c => c.name);
  if (!tournCols.includes("share_token")) db.exec("ALTER TABLE tournaments ADD COLUMN share_token TEXT");

  const cols = (db.prepare("PRAGMA table_info(schedule_entries)").all() as { name: string }[]).map(c => c.name);
  if (!cols.includes("pruefungs_id")) db.exec("ALTER TABLE schedule_entries ADD COLUMN pruefungs_id TEXT");
  if (!cols.includes("external_source")) db.exec("ALTER TABLE schedule_entries ADD COLUMN external_source TEXT");
  if (!cols.includes("tournament_id")) db.exec("ALTER TABLE schedule_entries ADD COLUMN tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE");

  const teamCols = (db.prepare("PRAGMA table_info(teams)").all() as { name: string }[]).map(c => c.name);
  if (!teamCols.includes("password_hash")) db.exec("ALTER TABLE teams ADD COLUMN password_hash TEXT");

  const speakerCols = (db.prepare("PRAGMA table_info(speakers)").all() as { name: string }[]).map(c => c.name);
  if (!speakerCols.includes("password_hash")) db.exec("ALTER TABLE speakers ADD COLUMN password_hash TEXT");

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
  const speakerCount = (db.prepare("SELECT COUNT(*) as c FROM speakers").get() as { c: number }).c;
  if (speakerCount === 0) {
    db.prepare("INSERT INTO speakers (name, role, color) VALUES (?, ?, ?)").run("Max Mustermann", "Hauptsprecher", "#3B82F6");
    db.prepare("INSERT INTO speakers (name, role, color) VALUES (?, ?, ?)").run("Anna Schmidt", "Co-Sprecher", "#10B981");
    db.prepare("INSERT INTO speakers (name, role, color) VALUES (?, ?, ?)").run("Klaus Weber", "Platzsprecher", "#F59E0B");
  }

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
