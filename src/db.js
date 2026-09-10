import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { seoulDayKey } from "./pet.js";

export const EMPTY_SEEN = '{"common":[],"special":[],"rare":[]}';
export const EMPTY_FOUND = "[]";

const petColumns = [
  "mood_value INTEGER",
  "mood_updated_at INTEGER",
  "xp INTEGER",
  "last_rewarded_at INTEGER",
  "reward_day TEXT",
  "reward_day_count INTEGER",
  "last_gift_day TEXT",
  "gift_seen TEXT",
  "gift_found TEXT",
  "days_together INTEGER",
  "last_active_day TEXT",
  "last_counter INTEGER",
  "next_gift_tier TEXT",
];

export function migratePetColumns(db, migrationMs = Date.now()) {
  db.transaction(() => {
    const existing = new Set(db.prepare("PRAGMA table_info(plushies)").all().map((c) => c.name));
    for (const def of petColumns) {
      if (!existing.has(def.split(" ")[0])) db.exec(`ALTER TABLE plushies ADD COLUMN ${def}`);
    }
    db.prepare("UPDATE plushies SET mood_value = 70 WHERE mood_value IS NULL").run();
    db.prepare("UPDATE plushies SET mood_updated_at = ? WHERE mood_updated_at IS NULL").run(migrationMs);
    db.prepare("UPDATE plushies SET xp = 0 WHERE xp IS NULL").run();
    db.prepare("UPDATE plushies SET reward_day_count = 0 WHERE reward_day_count IS NULL").run();
    db.prepare("UPDATE plushies SET gift_seen = ? WHERE gift_seen IS NULL").run(EMPTY_SEEN);
    db.prepare("UPDATE plushies SET gift_found = ? WHERE gift_found IS NULL").run(EMPTY_FOUND);
    db.prepare("UPDATE plushies SET days_together = 1 WHERE days_together IS NULL").run();
    db.prepare("UPDATE plushies SET last_active_day = ? WHERE last_active_day IS NULL").run(seoulDayKey(migrationMs));
  })();
}

export function openDatabase(dataDir = process.env.DATA_DIR || "./data") {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(join(dataDir, "plushies.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS plushies (
      uid TEXT PRIMARY KEY,
      pet_name TEXT NULL,
      owner_token_hash TEXT NULL,
      recovery_code_hash TEXT NULL,
      tap_count INTEGER DEFAULT 0,
      created_at TEXT,
      last_tap_at TEXT
    );
    CREATE TABLE IF NOT EXISTS claim_attempts (
      uid TEXT PRIMARY KEY REFERENCES plushies(uid) ON DELETE CASCADE,
      attempts INTEGER NOT NULL,
      window_start INTEGER NOT NULL
    );
  `);
  db.pragma("foreign_keys = ON");
  migratePetColumns(db);
  return db;
}
