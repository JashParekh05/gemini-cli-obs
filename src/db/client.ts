import Database from 'better-sqlite3';
import { homedir } from 'os';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';
import { runMigrations } from './migrations/index.js';
import { makeSessionQueries } from './queries/sessions.js';
import { makeEventQueries } from './queries/events.js';
import { makeBudgetQueries } from './queries/budget.js';
import { logger } from '../utils/logger.js';

export class DatabaseClient {
  private readonly db: Database.Database;
  public readonly sessions: ReturnType<typeof makeSessionQueries>;
  public readonly events: ReturnType<typeof makeEventQueries>;
  public readonly budget: ReturnType<typeof makeBudgetQueries>;

  constructor(dbPath: string) {
    const resolved = resolve(dbPath.replace(/^~/, homedir()));

    // Ensure parent directory exists
    mkdirSync(dirname(resolved), { recursive: true });

    this.db = new Database(resolved, {
      // Verbose SQL tracing only at debug level — always to stderr
      verbose:
        (process.env['LOG_LEVEL'] ?? '').toLowerCase() === 'debug'
          ? (sql: unknown) => logger.debug('SQL', { sql })
          : undefined,
    });

    // Production SQLite pragmas
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('cache_size = -32000'); // 32 MB cache

    runMigrations(this.db);

    this.sessions = makeSessionQueries(this.db);
    this.events = makeEventQueries(this.db);
    this.budget = makeBudgetQueries(this.db);

    logger.debug('DatabaseClient ready', { path: resolved });
  }

  /** Expose transactions for atomic multi-table writes */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    this.db.close();
  }
}
