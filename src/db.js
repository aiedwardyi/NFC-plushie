import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";

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
  return db;
}
