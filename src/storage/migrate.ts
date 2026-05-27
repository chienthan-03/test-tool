import type Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TARGET_VERSION = 3;

const MIGRATION_FILES: Record<number, string> = {
  1: '001_initial.sql',
  2: '002_entry_path.sql',
  3: '003_news_signal_tags.sql',
};

const migrationsDir = dirname(fileURLToPath(import.meta.url));

const getCurrentVersion = (db: Database.Database): number => {
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();

  if (!table) {
    return 0;
  }

  const row = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get() as {
    version: number;
  };

  return row.version;
};

export const migrate = (db: Database.Database): void => {
  const currentVersion = getCurrentVersion(db);

  if (currentVersion >= TARGET_VERSION) {
    return;
  }

  for (let version = currentVersion + 1; version <= TARGET_VERSION; version++) {
    const fileName = MIGRATION_FILES[version];
    if (!fileName) {
      throw new Error(`No migration file for version ${version}`);
    }

    const sqlPath = join(migrationsDir, 'migrations', fileName);
    const sql = readFileSync(sqlPath, 'utf8');
    db.exec(sql);

    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(
      version,
      new Date().toISOString(),
    );
  }
};
