import type Database from 'better-sqlite3';
import type { NewsSignal, SignalDirection, SignalSource } from '../../core/types.js';

interface SignalRow {
  id: string;
  news_id: string;
  symbols_json: string;
  direction: SignalDirection;
  strength: number;
  source: SignalSource;
  expires_at: string;
  created_at: string;
  tags_json: string;
}

const rowToSignal = (row: SignalRow): NewsSignal => ({
  id: row.id,
  newsId: row.news_id,
  symbols: JSON.parse(row.symbols_json) as string[],
  direction: row.direction,
  strength: row.strength,
  source: row.source,
  expiresAt: new Date(row.expires_at),
  createdAt: new Date(row.created_at),
  tags: JSON.parse(row.tags_json ?? '[]') as string[],
});

export class SignalRepository {
  constructor(private readonly db: Database.Database) {}

  insert(signal: NewsSignal): void {
    this.db
      .prepare(
        `INSERT INTO news_signals (
          id, news_id, symbols_json, direction, strength, source, expires_at, created_at, tags_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        signal.id,
        signal.newsId,
        JSON.stringify(signal.symbols),
        signal.direction,
        signal.strength,
        signal.source,
        signal.expiresAt.toISOString(),
        signal.createdAt.toISOString(),
        JSON.stringify(signal.tags ?? []),
      );
  }

  countLast24Hours(): number {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const row = this.db
      .prepare(`SELECT COUNT(*) AS count FROM news_signals WHERE created_at >= ?`)
      .get(since) as { count: number };
    return row.count;
  }

  listBetween(from: Date, to: Date): NewsSignal[] {
    const rows = this.db
      .prepare(
        `SELECT id, news_id, symbols_json, direction, strength, source, expires_at, created_at, tags_json
         FROM news_signals
         WHERE created_at >= ? AND created_at <= ?
         ORDER BY created_at ASC`,
      )
      .all(from.toISOString(), to.toISOString()) as SignalRow[];

    return rows.map(rowToSignal);
  }
}
