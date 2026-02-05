import type Database from 'better-sqlite3';
import { logger } from '../../utils/logger.js';
import * as m001 from './001_initial.js';

const migrations = [m001];

export function runMigrations(db: Database.Database): void {
  // Ensure the tracking table exists before querying it
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT    NOT NULL
    );
  `);

  for (const migration of migrations) {
    const already = db
      .prepare('SELECT 1 FROM schema_migrations WHERE version = ?')
      .get(migration.version);

    if (already) continue;

    logger.info(`Applying migration v${migration.version}`);
    db.transaction(() => {
      migration.up(db);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))",
      ).run(migration.version);
    })();
    logger.info(`Migration v${migration.version} applied`);
  }
}
