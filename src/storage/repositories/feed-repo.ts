import type Database from 'better-sqlite3';

export interface FeedStatusUpdate {
  feedId: string;
  lastSuccessAt?: Date | null;
  lastErrorAt?: Date | null;
  lastError?: string | null;
  consecutiveFailures?: number;
}

export interface FeedStatus {
  feedId: string;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export class FeedRepository {
  constructor(private readonly db: Database.Database) {}

  listAll(): FeedStatus[] {
    const rows = this.db
      .prepare(
        `SELECT feed_id, last_success_at, last_error_at, last_error, consecutive_failures
         FROM feed_status
         ORDER BY feed_id ASC`,
      )
      .all() as Array<{
        feed_id: string;
        last_success_at: string | null;
        last_error_at: string | null;
        last_error: string | null;
        consecutive_failures: number;
      }>;

    return rows.map((row) => ({
      feedId: row.feed_id,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
      lastErrorAt: row.last_error_at ? new Date(row.last_error_at) : null,
      lastError: row.last_error,
      consecutiveFailures: row.consecutive_failures,
    }));
  }

  getStatus(feedId: string): FeedStatus | null {
    const row = this.db
      .prepare(
        `SELECT feed_id, last_success_at, last_error_at, last_error, consecutive_failures
         FROM feed_status WHERE feed_id = ?`,
      )
      .get(feedId) as
      | {
          feed_id: string;
          last_success_at: string | null;
          last_error_at: string | null;
          last_error: string | null;
          consecutive_failures: number;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      feedId: row.feed_id,
      lastSuccessAt: row.last_success_at ? new Date(row.last_success_at) : null,
      lastErrorAt: row.last_error_at ? new Date(row.last_error_at) : null,
      lastError: row.last_error,
      consecutiveFailures: row.consecutive_failures,
    };
  }

  upsertStatus(update: FeedStatusUpdate): void {
    const existing = this.db
      .prepare(
        `SELECT feed_id, last_success_at, last_error_at, last_error, consecutive_failures
         FROM feed_status WHERE feed_id = ?`,
      )
      .get(update.feedId) as
      | {
          feed_id: string;
          last_success_at: string | null;
          last_error_at: string | null;
          last_error: string | null;
          consecutive_failures: number;
        }
      | undefined;

    const lastSuccessAt =
      update.lastSuccessAt !== undefined
        ? (update.lastSuccessAt?.toISOString() ?? null)
        : (existing?.last_success_at ?? null);

    const lastErrorAt =
      update.lastErrorAt !== undefined
        ? (update.lastErrorAt?.toISOString() ?? null)
        : (existing?.last_error_at ?? null);

    const lastError =
      update.lastError !== undefined ? update.lastError : (existing?.last_error ?? null);

    const consecutiveFailures =
      update.consecutiveFailures ?? existing?.consecutive_failures ?? 0;

    this.db
      .prepare(
        `INSERT INTO feed_status (
          feed_id, last_success_at, last_error_at, last_error, consecutive_failures
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(feed_id) DO UPDATE SET
          last_success_at = excluded.last_success_at,
          last_error_at = excluded.last_error_at,
          last_error = excluded.last_error,
          consecutive_failures = excluded.consecutive_failures`,
      )
      .run(update.feedId, lastSuccessAt, lastErrorAt, lastError, consecutiveFailures);
  }
}
