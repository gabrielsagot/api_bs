import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync, type StatementSync } from 'node:sqlite';

// SQLite intégré à Node (node:sqlite) : aucune dépendance native à compiler.

export type SqlValue = string | number | bigint | null | Uint8Array;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

type StatementArgs = Parameters<StatementSync['run']>;

const MIGRATIONS: string[] = [
  /* v1 */ `
  CREATE TABLE players (
    tag            TEXT PRIMARY KEY,
    name           TEXT NOT NULL DEFAULT '',
    name_color     TEXT,
    icon_id        INTEGER,
    club_tag       TEXT,
    club_name      TEXT,
    is_primary     INTEGER NOT NULL DEFAULT 0,
    color_slot     INTEGER NOT NULL DEFAULT 0,
    added_at       TEXT NOT NULL,
    last_polled_at TEXT,
    last_battle_at TEXT,
    last_error     TEXT,
    profile_json   TEXT
  );

  CREATE TABLE player_snapshots (
    id               INTEGER PRIMARY KEY,
    tag              TEXT NOT NULL REFERENCES players(tag) ON DELETE CASCADE,
    taken_at         TEXT NOT NULL,
    trophies         INTEGER NOT NULL,
    highest_trophies INTEGER NOT NULL,
    exp_level        INTEGER,
    exp_points       INTEGER,
    victories_3v3    INTEGER,
    solo_victories   INTEGER,
    duo_victories    INTEGER,
    brawlers_owned   INTEGER,
    power11          INTEGER,
    gadgets          INTEGER,
    star_powers      INTEGER,
    hyper_charges    INTEGER,
    gears            INTEGER
  );
  CREATE INDEX player_snapshots_tag_time ON player_snapshots(tag, taken_at);

  CREATE TABLE brawler_snapshots (
    id               INTEGER PRIMARY KEY,
    tag              TEXT NOT NULL REFERENCES players(tag) ON DELETE CASCADE,
    brawler_id       INTEGER NOT NULL,
    taken_at         TEXT NOT NULL,
    trophies         INTEGER NOT NULL,
    highest_trophies INTEGER NOT NULL,
    power            INTEGER NOT NULL,
    rank             INTEGER
  );
  CREATE INDEX brawler_snapshots_lookup ON brawler_snapshots(tag, brawler_id, taken_at);

  CREATE TABLE battles (
    id                INTEGER PRIMARY KEY,
    tag               TEXT NOT NULL REFERENCES players(tag) ON DELETE CASCADE,
    battle_time       TEXT NOT NULL,
    event_id          INTEGER,
    mode              TEXT NOT NULL,
    map               TEXT,
    type              TEXT NOT NULL,
    outcome           TEXT,
    rank              INTEGER,
    trophy_change     INTEGER,
    duration          INTEGER,
    star_player       INTEGER NOT NULL DEFAULT 0,
    brawler_id        INTEGER,
    brawler_name      TEXT,
    brawler_power     INTEGER,
    brawler_trophies  INTEGER,
    teams_count       INTEGER,
    participants_json TEXT NOT NULL,
    raw_json          TEXT NOT NULL,
    UNIQUE (tag, battle_time)
  );
  CREATE INDEX battles_tag_time ON battles(tag, battle_time);

  CREATE TABLE goals (
    id          INTEGER PRIMARY KEY,
    tag         TEXT NOT NULL REFERENCES players(tag) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    brawler_id  INTEGER,
    target      INTEGER NOT NULL,
    start_value INTEGER NOT NULL,
    created_at  TEXT NOT NULL,
    achieved_at TEXT
  );

  CREATE TABLE kv (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  `,
  /* v2 : points (ELO) et rang Ranked, fournis par le profil */ `
  ALTER TABLE player_snapshots ADD COLUMN ranked_elo INTEGER;
  ALTER TABLE player_snapshots ADD COLUMN ranked_rank INTEGER;
  `,
];

export class Db {
  readonly file: string;
  private readonly sqlite: DatabaseSync;
  private readonly statements = new Map<string, StatementSync>();

  constructor(file: string) {
    this.file = file;
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.sqlite = new DatabaseSync(file);
    this.sqlite.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
    `);
    this.migrate();
  }

  private migrate(): void {
    const row = this.sqlite.prepare('PRAGMA user_version').get() as { user_version: number };
    for (let version = row.user_version; version < MIGRATIONS.length; version++) {
      this.transaction(() => {
        this.sqlite.exec(MIGRATIONS[version]);
        this.sqlite.exec(`PRAGMA user_version = ${version + 1}`);
      });
    }
  }

  private statement(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.sqlite.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  private args(params?: SqlParams): StatementArgs {
    if (!params) return [] as unknown as StatementArgs;
    return (Array.isArray(params) ? params : [params]) as unknown as StatementArgs;
  }

  run(sql: string, params?: SqlParams): { changes: number; lastInsertRowid: number } {
    const result = this.statement(sql).run(...this.args(params));
    return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
  }

  get<T>(sql: string, params?: SqlParams): T | undefined {
    return this.statement(sql).get(...this.args(params)) as T | undefined;
  }

  all<T>(sql: string, params?: SqlParams): T[] {
    return this.statement(sql).all(...this.args(params)) as T[];
  }

  exec(sql: string): void {
    this.sqlite.exec(sql);
  }

  /** Transaction simple (non imbriquable). */
  transaction<T>(fn: () => T): T {
    this.sqlite.exec('BEGIN');
    try {
      const result = fn();
      this.sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }

  sizeBytes(): number {
    if (this.file === ':memory:') return 0;
    let total = 0;
    for (const suffix of ['', '-wal']) {
      try {
        total += fs.statSync(this.file + suffix).size;
      } catch {
        // fichier absent : rien à compter
      }
    }
    return total;
  }

  close(): void {
    this.sqlite.close();
  }
}

/** Petit magasin clé/valeur (cache du catalogue, de la rotation, de la clé API…). */
export class KvStore {
  constructor(private readonly db: Db) {}

  getJson<T>(key: string): { value: T; updatedAt: string } | null {
    const row = this.db.get<{ value: string; updated_at: string }>('SELECT value, updated_at FROM kv WHERE key = ?', [key]);
    if (!row) return null;
    try {
      return { value: JSON.parse(row.value) as T, updatedAt: row.updated_at };
    } catch {
      return null;
    }
  }

  setJson(key: string, value: unknown, now = new Date().toISOString()): void {
    this.db.run(
      `INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [key, JSON.stringify(value), now],
    );
  }

  delete(key: string): void {
    this.db.run('DELETE FROM kv WHERE key = ?', [key]);
  }
}
