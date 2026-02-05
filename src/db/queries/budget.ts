import type Database from 'better-sqlite3';

export interface BudgetRow {
  id: number;
  max_per_session_usd: number;
  max_per_day_usd: number;
  alert_threshold_pct: number;
  updated_at: string;
}

export function makeBudgetQueries(db: Database.Database) {
  const getStmt = db.prepare<[], BudgetRow>(`SELECT * FROM budget_config WHERE id = 1`);

  const upsertStmt = db.prepare<[number, number, number, string]>(`
    UPDATE budget_config
    SET max_per_session_usd = ?,
        max_per_day_usd     = ?,
        alert_threshold_pct = ?,
        updated_at          = ?
    WHERE id = 1
  `);

  return {
    get(): BudgetRow {
      // Row is always present (seeded by migration)
      return getStmt.get() as BudgetRow;
    },

    update(params: {
      maxPerSessionUsd: number;
      maxPerDayUsd: number;
      alertThresholdPct: number;
    }): void {
      upsertStmt.run(
        params.maxPerSessionUsd,
        params.maxPerDayUsd,
        params.alertThresholdPct,
        new Date().toISOString(),
      );
    },
  };
}
